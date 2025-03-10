"use client";

import { useState, useRef, useEffect } from "react";
import toast from 'react-hot-toast';

interface UploadedAudio {
  name: string;
  status: "Pendiente" | "Procesando" | "Completado" | "Error al procesar";
  transcriptLink?: string;
  audioLink?: string;
}

export default function MicrophoneComponent() {
  const [isRecording, setIsRecording] = useState(false);
  const [uploadedAudios, setUploadedAudios] = useState<UploadedAudio[]>([]);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitAction, setExitAction] = useState<(() => void) | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // URL del backend
  const backendUrl = "/api";

  useEffect(() => {
    // Detectar intento de salir en móviles y escritorio
    const handleExitAttempt = (event: Event) => {
      event.preventDefault();
      setShowExitModal(true);
      return false;
    };

    // Detectar cuando el usuario cambia de pestaña o minimiza la app
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        setShowExitModal(true);
      }
    };

    // Detectar intento de cerrar la página en móviles y escritorio
    window.addEventListener("pagehide", handleExitAttempt);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", handleExitAttempt);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  
  
  const handleExit = () => {
    if (exitAction) {
      exitAction(); // Ejecuta la acción de salida
      setShowExitModal(false);
    }
  };
  
  const cancelExit = () => setShowExitModal(false);
  
  // Función para iniciar la grabación
  const startRecording = async () => {
    setIsRecording(true);
    setProcessingMessage("🎙️ Grabando audio...");
    toast.success("Grabación iniciada");

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    mediaRecorderRef.current = mediaRecorder;
    audioChunksRef.current = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      const fileName = `Record-${Date.now()}.webm`;
      await uploadAudio(audioBlob, fileName);
    };

    mediaRecorder.start(1000); // Enviar un chunk cada 1 segundo
  };

  // Función para detener la grabación
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    toast.success("Grabación detenida");
  };

  // Función para manejar la subida de archivos
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
      files.forEach(async (file) => {
        const newAudio: UploadedAudio = {
          name: file.name,
          status: "Pendiente",
        };

        setUploadedAudios((prev) => [...prev, newAudio]);
        await uploadAudio(file, file.name);
      });
    }
  };

  // Función para subir un archivo de audio al backend
  const uploadAudio = async (audioBlob: Blob, fileName: string) => {
    const audioFile = new File([audioBlob], fileName, { type: "audio/webm" });
  
    if (!audioFile) {
      console.error("🚨 Error: El archivo es nulo o indefinido.");
      toast.error("Error al subir el archivo");
      return;
    }
  
    const formData = new FormData();
    formData.append("file", audioFile);
  
    try {
      // Subir el archivo
      const uploadResponse = await fetch(`${backendUrl}/upload`, {
        method: "POST",
        body: formData,
      });
  
      if (!uploadResponse.ok) {
        throw new Error(`Error al subir el archivo: ${uploadResponse.statusText}`);
      }
  
      const uploadData = await uploadResponse.json();
  
      if (!uploadData.message || uploadData.message !== "Archivo subido con éxito") {
        throw new Error("No se pudo subir el archivo.");
      }
  
      // Actualizar el estado a "Procesando"
      setUploadedAudios((prev) =>
        prev.map((audio) =>
          audio.name === fileName
            ? {
                ...audio,
                status: "Procesando",
              }
            : audio
        )
      );
  
      // Forzar un pequeño retraso para asegurar que el estado "Procesando" se muestre
      await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms de retraso
  
      // Iniciar la transcripción
      const segmentDuration = 60;
      const fileNameKey = uploadData.file_info.Key.split('/').pop();
  
      const transcribeResponse = await fetch(
        `${backendUrl}/transcribe/${fileNameKey}?segment_duration=${segmentDuration}`,
        { method: "POST" }
      );
  
      if (!transcribeResponse.ok) {
        throw new Error(`Error al obtener la transcripción: ${transcribeResponse.statusText}`);
      }
  
      const transcribeData = await transcribeResponse.json();
  
      if (!transcribeData.file_details || !transcribeData.file_details.transcription_file_url) {
        throw new Error("No se pudo obtener el enlace del archivo de transcripción.");
      }
  
      // Actualizar el estado a "Completado"
      setUploadedAudios((prev) =>
        prev.map((audio) =>
          audio.name === fileName
            ? {
                ...audio,
                status: "Completado",
                audioLink: uploadData.file_info.URL,
                transcriptLink: transcribeData.file_details.transcription_file_url,
              }
            : audio
        )
      );
  
      toast.success("Audio subido y transcrito correctamente");
    } catch (error) {
      console.error("🚨 Error al subir audio o obtener la transcripción:", error);
      setUploadedAudios((prev) =>
        prev.map((audio) =>
          audio.name === fileName
            ? {
                ...audio,
                status: "Error al procesar",
              }
            : audio
        )
      );
      toast.error("Error al procesar el audio");
    } finally {
      setProcessingMessage(null);
    }
  };
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full py-20 bg-[#70D7D9]">
       {/* MODAL DE CONFIRMACIÓN */}
        {showExitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-white px-8 py-14 rounded-xl shadow-xl text-center max-w-md w-full flex flex-col items-center">
            <h2 className="text-2xl font-bold text-red-600 mb-4">⚠️ Advertencia</h2>
            <p className="text-gray-700 text-lg leading-relaxed mb-4">
              Tienes procesos activos en este momento.  
              Si sales ahora, <b>perderás todo tu progreso</b>.  
              <br /><br />
              ¿Seguro que quieres salir de la página?
            </p>
            <div className="mt-6 flex justify-around sm:flex-row w-full gap-4">
              <button 
                onClick={() => { setShowExitModal(false); window.location.reload(); }} 
                className="bg-red-500 hover:bg-red-600 text-white font-semibold px-6 py-3 rounded w-full sm:w-auto transition-all">
                Salir 😟
              </button>
              <button 
                onClick={() => setShowExitModal(false)} 
                className="bg-green-500 hover:bg-green-600 text-white font-semibold px-6 py-3 rounded w-full sm:w-auto transition-all">
                Continuar el proceso
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="bg-white rounded-xl w-full max-w-3xl shadow-lg flex flex-col">
        <div className="w-full h-24 rounded-t-xl flex justify-center items-center bg-[#47CACC]">
          <img
            className="w-40 h-fit"
            src="https://www.procencia.com/wp-content/uploads/2024/12/procencia.png"
            alt="Logo de Procencia"
          />
        </div>
        <div className="px-8 py-12 flex-grow">
          {/* Grabación de audio */}
          <div className="text-center">
            <p className="text-xl font-medium text-gray-700 mb-8">🎤 Graba un audio</p>
            <div className="flex justify-center">
              {isRecording ? (
                <button
                  onClick={stopRecording}
                  className="p-6 rounded-full bg-red-500 text-white text-3xl shadow-md animate-pulse hover:bg-red-600 transition-all"
                >
                  ⏹️
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  className="p-6 rounded-full bg-[#47CACC] text-white text-3xl shadow-md hover:bg-[#3aa8a9] transition-all"
                >
                  🗣️
                </button>
              )}
            </div>
            {isRecording && <p className="text-red-500 mt-2">🔴 Grabando...</p>}
          </div>

          {/* Subida de archivos */}
          <div className="mt-8 text-center flex flex-col justify-center items-center">
            <p className="text-xl font-medium text-gray-700 mb-8">📂 Sube audios desde tu dispositivo</p>
            <label className="flex flex-col items-center justify-center w-80 h-32 border-2 border-dashed border-[#47CACC] rounded-lg cursor-pointer hover:bg-gray-50 transition-all p-4">
              <span className="text-4xl text-[#47CACC]">📤</span>
              <span className="text-gray-600 text-sm mt-3">Haz clic aquí o arrastra tus archivos</span>
              <input type="file" multiple accept="audio/*" className="hidden" onChange={handleFileChange} />
            </label>
          </div>

          {/* Notificación de procesamiento */}
          {processingMessage && (
            <div className="mt-6 p-3 bg-yellow-100 border border-yellow-300 rounded text-yellow-800 text-center">
              {processingMessage}
            </div>
          )}

          {/* Lista de audios subidos */}
          {uploadedAudios.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold text-gray-700 mb-4 pb-2 border-b">📁 Archivos Subidos</h3>
              <ul className="space-y-3">
                {uploadedAudios.map((audio, index) => (
                  <li
                    key={index}
                    className="p-4 bg-gray-50 rounded-xl border flex flex-col sm:flex-row justify-between items-center"
                  >
                    <div className="flex items-center">
                      <span className="text-gray-500 mr-3">{index + 1}.</span>
                      <span className="text-xl mr-3">🎵</span>
                      <span className="text-gray-700">{audio.name}</span>
                      <span
                        className={`ml-3 px-3 py-1 rounded-full text-sm font-medium ${
                          audio.status === "Pendiente"
                            ? "bg-gray-200 text-gray-700"
                            : audio.status === "Procesando"
                            ? "bg-yellow-200 text-yellow-800"
                            : audio.status === "Completado"
                            ? "bg-green-200 text-green-800"
                            : "bg-red-200 text-red-800"
                        }`}
                      >
                        {audio.status}
                      </span>
                    </div>

                    {/* Botón para descargar transcripción */}
                    {audio.status === "Completado" && audio.transcriptLink && (
                      <a
                        href={audio.transcriptLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 sm:mt-0 px-4 py-2 bg-[#47CACC] text-white rounded-full shadow-md hover:bg-[#3aa8a9] transition-all"
                      >
                        📥 Descargar TXT
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}