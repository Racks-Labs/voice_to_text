import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

const drive = google.drive({ version: "v3", auth });

export async function POST(req: NextRequest) {
  console.log("📌 Nueva solicitud recibida en /api/upload-audio");

  try {
    const body = await req.json();
    console.log("📌 Datos recibidos en API:", body);

    const { fileName, fileType } = body;

    if (!fileName || !fileType) {
      console.error("⚠️ Faltan parámetros obligatorios:", { fileName, fileType });
      return NextResponse.json(
        { error: "Se requieren 'fileName' y 'fileType'" },
        { status: 400 }
      );
    }

    console.log(`📌 Intentando crear sesión de subida para: ${fileName} (${fileType})`);

    const res = await drive.files.create(
      {
        requestBody: {
          name: fileName,
          parents: [process.env.DRIVE_FOLDER_ID!],
        },
        media: { mimeType: fileType },
      },
      {
        params: { uploadType: "resumable" },
        headers: {
          "X-Upload-Content-Type": fileType,
          "Content-Type": "application/json; charset=UTF-8",
        },
      }
    );

    console.log("📌 Respuesta de Google Drive recibida:", res);

    // Obtener URL de subida desde headers
    const uploadUrl = res.headers["location"];

    if (!uploadUrl) {
      console.error("⚠️ No se recibió URL de subida de Google Drive. Headers:", res.headers);
      throw new Error("No se recibió URL de subida de Google Drive");
    }

    console.log("✅ URL de subida obtenida correctamente:", uploadUrl);

    return NextResponse.json({ uploadUrl });
  } catch (error) {
    console.error("❌ Error en API upload-audio:", error);

    return NextResponse.json(
      {
        error: "Error al generar URL de subida",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
