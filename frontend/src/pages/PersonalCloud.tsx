import { useState, useEffect } from 'react'
import { 
  Cloud, Upload, Search, Trash2, ShieldCheck, 
  File, FileText, Image, Video, Music, Info, RefreshCw 
} from 'lucide-react'
import { api } from '../services/api'

interface CloudFile {
  id: string
  user_id: string
  file_name: string
  file_url: string
  file_size: number
  file_type: string
  is_encrypted: boolean
  created_at: string
}

export default function PersonalCloud() {
  const [files, setFiles] = useState<CloudFile[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [encryptedOnly, setEncryptedOnly] = useState(false)

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [isEncrypted, setIsEncrypted] = useState(false)
  const [uploading, setUploading] = useState(false)

  const loadFiles = async () => {
    setLoading(true)
    const { data } = await api.get<CloudFile[]>('/cloud/files')
    setLoading(false)
    if (data) setFiles(data)
  }

  useEffect(() => {
    loadFiles()
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setUploadFile(file)
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile) return
    setUploading(true)

    const formData = new FormData()
    formData.append('file', uploadFile)

    const endpoint = `/cloud/upload?is_encrypted=${isEncrypted}`
    const { error } = await api.post(endpoint, formData)
    setUploading(false)
    if (!error) {
      setUploadFile(null)
      loadFiles()
    } else {
      alert(error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this file?')) return
    const { error } = await api.delete(`/cloud/files/${id}`)
    if (!error) {
      loadFiles()
    } else {
      alert(error)
    }
  }

  // Format file size helper
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // File icon lookup
  const getFileIcon = (mime: string) => {
    if (mime.startsWith('image/')) return <Image className="w-8 h-8 text-amber-400" />
    if (mime.startsWith('video/')) return <Video className="w-8 h-8 text-rose-400" />
    if (mime.startsWith('audio/')) return <Music className="w-8 h-8 text-emerald-400" />
    if (mime.startsWith('text/')) return <FileText className="w-8 h-8 text-sky-400" />
    return <File className="w-8 h-8 text-indigo-400" />
  }

  // Filter list
  const filteredFiles = files.filter(f => {
    const matchesSearch = f.file_name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesEncrypted = !encryptedOnly || f.is_encrypted
    return matchesSearch && matchesEncrypted
  })

  // Calculate storage usage (limit mock 500MB)
  const totalUsedBytes = files.reduce((acc, curr) => acc + curr.file_size, 0)
  const limitBytes = 500 * 1024 * 1024 // 500 MB
  const usagePercentage = Math.min(Math.round((totalUsedBytes / limitBytes) * 100), 100)

  return (
    <div className="space-y-6 h-full flex flex-col overflow-hidden p-6 bg-transparent">
      {/* Header */}
      <div className="flex-shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Cloud className="w-7 h-7 text-[var(--accent)]" />
            Personal Cloud
          </h2>
          <p className="text-[var(--text-secondary)] text-sm">A secure vault to store documents, voice notes, images, and videos.</p>
        </div>

        {/* Upload form widget */}
        <form onSubmit={handleUpload} className="flex gap-3 items-center bg-[var(--bg-card)] p-2 rounded-xl border border-[var(--border-color)] flex-wrap">
          <input 
            type="file" 
            onChange={handleFileChange}
            className="hidden" 
            id="cloud-file-input"
          />
          <button 
            type="button"
            onClick={() => document.getElementById('cloud-file-input')?.click()}
            className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-xs font-bold text-white hover:bg-white/5 cursor-pointer"
          >
            {uploadFile ? uploadFile.name : 'Select File'}
          </button>
          
          <label className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={isEncrypted}
              onChange={(e) => setIsEncrypted(e.target.checked)}
              className="rounded accent-[var(--accent)]"
            />
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Encrypt
            </span>
          </label>

          <button 
            type="submit"
            disabled={uploading || !uploadFile}
            className="px-4 py-1.5 rounded-lg btn-premium text-xs font-bold flex items-center gap-1 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{uploading ? 'Uploading...' : 'Upload'}</span>
          </button>
        </form>
      </div>

      {/* Grid split folder */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 overflow-hidden min-h-0">
        
        {/* Left Side: storage info and filters */}
        <div className="w-full lg:w-72 glass-card p-6 flex flex-col justify-between overflow-hidden flex-shrink-0 space-y-6">
          <div className="space-y-6 flex-1">
            <div className="space-y-3">
              <div className="flex justify-between items-baseline text-xs font-bold">
                <span className="text-white">Storage Vitals</span>
                <span className="text-[var(--text-secondary)]">{formatSize(totalUsedBytes)} of 500 MB</span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${usagePercentage}%` }}
                />
              </div>
            </div>

            {/* Filters panel */}
            <div className="space-y-4 pt-4 border-t border-[var(--border-color)]">
              <div>
                <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">SEARCH</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-[var(--text-secondary)]" />
                  <input 
                    type="text" 
                    placeholder="Search file name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 glass-input text-xs"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={encryptedOnly}
                  onChange={(e) => setEncryptedOnly(e.target.checked)}
                  className="rounded accent-[var(--accent)]"
                />
                <span>Show encrypted files only</span>
              </label>
            </div>
          </div>
        </div>

        {/* Right Side: Files Explorer Grid */}
        <div className="flex-1 glass-card p-6 overflow-y-auto">
          {loading && files.length === 0 ? (
            <div className="py-20 text-center flex items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-[var(--accent)]" />
              <span className="text-xs text-[var(--text-secondary)]">Syncing explorer...</span>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="py-24 text-center space-y-4 border border-dashed border-[var(--border-color)] rounded-2xl p-6">
              <Cloud className="w-12 h-12 text-[var(--text-secondary)] mx-auto opacity-30" />
              <h4 className="font-extrabold text-sm text-white">No files found</h4>
              <p className="text-xs text-[var(--text-secondary)] max-w-xs mx-auto">Upload documents or photos to save them safely in your personal cloud vault storage.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredFiles.map(file => (
                <div 
                  key={file.id}
                  className="p-4 bg-black/25 border border-[var(--border-color)] rounded-xl flex flex-col justify-between hover:border-indigo-500/30 transition-all duration-200"
                >
                  <div className="flex items-start justify-between">
                    {getFileIcon(file.file_type)}

                    <div className="flex gap-1 items-center">
                      {file.is_encrypted && (
                        <span title="E2EE Encrypted">
                          <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        </span>
                      )}
                      <button 
                        onClick={() => handleDelete(file.id)}
                        className="p-1 rounded hover:bg-white/5 text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <h5 className="text-xs font-bold text-white truncate" title={file.file_name}>
                      {file.file_name}
                    </h5>
                    <span className="text-[10px] text-[var(--text-secondary)] block mt-0.5">
                      {formatSize(file.file_size)}
                    </span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-center text-[8px] text-[var(--text-secondary)] font-semibold">
                    <span>Uploaded {new Date(file.created_at).toLocaleDateString()}</span>
                    <a 
                      href={file.file_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[var(--accent)] hover:underline font-bold"
                    >
                      Download
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
