-- Foto de perfil del usuario: solo la REFERENCIA (key) al objeto en el
-- almacenamiento (S3/MinIO/R2). El binario nunca se guarda en la base de datos.
ALTER TABLE "usuarios" ADD COLUMN "clave_foto" TEXT;
