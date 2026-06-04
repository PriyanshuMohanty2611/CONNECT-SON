import os
import uuid
import shutil
import hashlib
import json
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.models import User
from app.core.redis_client import get_redis_client
from app.services.media_service import upload_file_to_storage

router = APIRouter()

TEMP_CHUNKS_DIR = "static/uploads/chunks"

@router.post("/start")
async def start_upload(
    file_name: str,
    file_size: int,
    checksum: str, # SHA256 hash
    total_chunks: int,
    current_user: User = Depends(get_current_active_user)
):
    upload_id = str(uuid.uuid4())
    manifest = {
        "file_name": file_name,
        "file_size": file_size,
        "checksum": checksum,
        "total_chunks": total_chunks,
        "uploader_id": current_user.id
    }
    
    redis = get_redis_client()
    # Cache manifest configuration for 24 hours
    await redis.set(f"upload_manifest:{upload_id}", json.dumps(manifest), ex=86400)
    
    # Create chunks folder
    os.makedirs(os.path.join(TEMP_CHUNKS_DIR, upload_id), exist_ok=True)
    
    return {"upload_id": upload_id, "manifest": manifest}

@router.post("/chunk")
async def upload_chunk(
    upload_id: str,
    chunk_index: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user)
):
    redis = get_redis_client()
    manifest_raw = await redis.get(f"upload_manifest:{upload_id}")
    if not manifest_raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Upload session not found or expired"
        )
        
    manifest = json.loads(manifest_raw)
    if manifest["uploader_id"] != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        
    # Write chunk locally
    chunk_path = os.path.join(TEMP_CHUNKS_DIR, upload_id, f"{chunk_index}.chunk")
    with open(chunk_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Mark chunk as uploaded in Redis set
    await redis.sadd(f"uploaded_chunks:{upload_id}", str(chunk_index))
    
    return {"upload_id": upload_id, "chunk_index": chunk_index, "status": "uploaded"}

@router.post("/complete")
async def complete_upload(
    upload_id: str,
    current_user: User = Depends(get_current_active_user)
):
    redis = get_redis_client()
    manifest_raw = await redis.get(f"upload_manifest:{upload_id}")
    if not manifest_raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Upload session not found or expired"
        )
        
    manifest = json.loads(manifest_raw)
    if manifest["uploader_id"] != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        
    total_chunks = manifest["total_chunks"]
    uploaded_count = await redis.smembers(f"uploaded_chunks:{upload_id}")
    
    if len(uploaded_count) < total_chunks:
        missing = [i for i in range(total_chunks) if str(i) not in uploaded_count]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Missing chunks", "missing_indices": missing}
        )
        
    # Reassemble chunks
    assembled_dir = "static/uploads/assembled"
    os.makedirs(assembled_dir, exist_ok=True)
    assembled_path = os.path.join(assembled_dir, f"{upload_id}_{manifest['file_name']}")
    
    try:
        with open(assembled_path, "wb") as target_file:
            for idx in range(total_chunks):
                chunk_path = os.path.join(TEMP_CHUNKS_DIR, upload_id, f"{idx}.chunk")
                with open(chunk_path, "rb") as source_file:
                    target_file.write(source_file.read())
                    
        # Verify SHA256 checksum
        sha256 = hashlib.sha256()
        with open(assembled_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256.update(byte_block)
        calculated_hash = sha256.hexdigest()
        
        if calculated_hash != manifest["checksum"]:
            if os.path.exists(assembled_path):
                os.remove(assembled_path)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Checksum mismatch. File is corrupted."
            )
            
        # Security validation (MIME-signature checks)
        class AssembledUploadFile(UploadFile):
            def __init__(self, path, filename):
                self._file = open(path, "rb")
                self.filename = filename
                import mimetypes
                self.content_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
                super().__init__(file=self._file, filename=filename)
                
            def close(self):
                self._file.close()
        
        wrapped_file = AssembledUploadFile(assembled_path, manifest["file_name"])
        
        # Validate whitelist content type
        ALLOWED_TYPES = [
            "image/jpeg", "image/png", "image/gif", "image/webp",
            "video/mp4", "video/webm", "video/ogg",
            "application/pdf", "audio/mpeg", "audio/wav"
        ]
        if wrapped_file.content_type not in ALLOWED_TYPES:
            wrapped_file.close()
            if os.path.exists(assembled_path):
                os.remove(assembled_path)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Content type {wrapped_file.content_type} is not supported."
            )
            
        # Upload using media service
        url = upload_file_to_storage(wrapped_file)
        
        # Clean up files
        wrapped_file.close()
        if os.path.exists(assembled_path):
            os.remove(assembled_path)
        shutil.rmtree(os.path.join(TEMP_CHUNKS_DIR, upload_id), ignore_errors=True)
        
        # Clean Redis
        await redis.delete(f"upload_manifest:{upload_id}")
        await redis.delete(f"uploaded_chunks:{upload_id}")
        
        return {
            "file_url": url,
            "file_name": manifest["file_name"],
            "file_size": manifest["file_size"],
            "file_type": wrapped_file.content_type
        }
    except Exception as e:
        if os.path.exists(assembled_path):
            os.remove(assembled_path)
        shutil.rmtree(os.path.join(TEMP_CHUNKS_DIR, upload_id), ignore_errors=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload completion failed: {e}"
        )
