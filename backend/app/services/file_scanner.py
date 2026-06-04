import io
from fastapi import UploadFile, HTTPException, status

# Magic bytes signatures
SIGNATURES = {
    "image/jpeg": [b"\xFF\xD8\xFF"],
    "image/png": [b"\x89\x50\x4E\x47\x0D\x0A\x1A\x0A"],
    "image/gif": [b"GIF87a", b"GIF89a"],
    "image/webp": [b"RIFF"],  # WebP has RIFF at start and WEBP at bytes 8-12
    "application/pdf": [b"%PDF"],
    "application/zip": [b"PK\x03\x04"],
    "video/mp4": [b"ftypmp42", b"ftypisom", b"ftypMSNV", b"ftypmp41"], # usually at offset 4, but we can search or check start
    "video/webm": [b"\x1A\x45\xDF\xA3"],
    "audio/mpeg": [b"ID3", b"\xFF\xFB", b"\xFF\xF3", b"\xFF\xF2"],
    "audio/webm": [b"\x1A\x45\xDF\xA3"],
    "audio/ogg": [b"OggS"],
    "audio/wav": [b"RIFF"],
}

EICAR_SIGNATURE = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"

def scan_file(file: UploadFile) -> bool:
    """
    Scans an UploadFile for integrity and security.
    1. Verifies that the file header (magic bytes) matches the declared content_type.
    2. Runs a threat/malware scan (checking for EICAR signature test file).
    """
    # Read header bytes
    header = file.file.read(64)
    file.file.seek(0)  # Reset stream

    content_type = file.content_type
    
    # 1. Signature Check
    if content_type in SIGNATURES:
        signatures = SIGNATURES[content_type]
        matched = False
        for sig in signatures:
            if header.startswith(sig) or sig in header:
                matched = True
                break
        
        # Special check for WebP / WAV / MP4 start variations
        if not matched:
            # Let's check if it's RIFF / ftyp in the first 16 bytes
            if b"RIFF" in header[:12] or b"ftyp" in header[:16] or b"ID3" in header[:10]:
                matched = True
                
        if not matched:
            raise ValueError(
                f"Security scan failed: File signature mismatch. The file content does not match type '{content_type}'."
            )

    # 2. Virus / Threat Scan (EICAR check and mock antivirus logs)
    content = file.file.read()
    file.file.seek(0) # Reset stream

    if EICAR_SIGNATURE in content:
        raise ValueError(
            "Security scan failed: Malware/Virus signature detected (EICAR standard test file)."
        )

    print(f"🛡️ Security Scan Passed: {file.filename} ({content_type}, {len(content)} bytes) is clean.")
    return True
