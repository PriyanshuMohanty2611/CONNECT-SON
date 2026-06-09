import os
import uuid
import shutil
import io
from fastapi import UploadFile
import cloudinary
import cloudinary.uploader
from app.core.config import settings

# Initialize Cloudinary if credentials exist
if settings.CLOUDINARY_CLOUD_NAME and settings.CLOUDINARY_API_KEY and settings.CLOUDINARY_API_SECRET:
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True
    )
    CLOUDINARY_ENABLED = True
else:
    CLOUDINARY_ENABLED = False

def upload_file_to_storage(file: UploadFile, folder: str = "connect_on") -> str:
    # Ensure file upload directory exists
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    
    # Read file content safely into memory to avoid closed stream / EOF issues
    try:
        file.file.seek(0)
        file_content = file.file.read()
        file.file.seek(0) # reset original file stream just in case
    except Exception as e:
        print(f"Failed to read file content: {e}")
        file_content = b""
    
    if CLOUDINARY_ENABLED and file_content:
        try:
            # Upload to Cloudinary using a fresh BytesIO stream
            result = cloudinary.uploader.upload(
                io.BytesIO(file_content),
                folder=folder,
                resource_type="auto",
                quality="auto",
                fetch_format="auto"
            )
            secure_url = result.get("secure_url")
            if secure_url:
                return secure_url
        except Exception as e:
            # Log error and fall back to local storage
            print(f"Cloudinary upload failed: {e}. Falling back to local storage.")
    
    # Local fallback - save file and return relative URL path
    ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
    unique_filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)
    
    # Save file locally from memory content
    try:
        with open(file_path, "wb") as buffer:
            buffer.write(file_content)
    except Exception as local_err:
        print(f"Failed to write file locally: {local_err}")
        
    # Return relative URL - accessible via /static/uploads mounted route
    return f"/static/uploads/{unique_filename}"

