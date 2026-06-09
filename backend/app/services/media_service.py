import os
import uuid
import shutil
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
    
    if CLOUDINARY_ENABLED:
        try:
            # Upload to Cloudinary
            result = cloudinary.uploader.upload(
                file.file,
                folder=folder,
                resource_type="auto",
                quality="auto",
                fetch_format="auto"
            )
            return result.get("secure_url")
        except Exception as e:
            # Log error and fall back to local storage
            print(f"Cloudinary upload failed: {e}. Falling back to local storage.")
    
    # Local fallback - save file and return relative URL path
    ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
    unique_filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)
    
    # Save file locally
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Return relative URL - accessible via /static/uploads mounted route
    return f"/static/uploads/{unique_filename}"
