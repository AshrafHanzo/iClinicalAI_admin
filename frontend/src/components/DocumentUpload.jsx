import { useState, useRef } from 'react';

export default function DocumentUpload({ onUpload, isUploading }) {
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const handleFile = (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'docx', 'doc', 'txt'].includes(ext)) {
      alert('Unsupported file type. Please upload PDF, DOCX, or TXT.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      alert('File too large. Maximum 20MB.');
      return;
    }
    onUpload(file);
  };

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); };
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);

  return (
    <div
      className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
      onClick={() => fileRef.current?.click()}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt"
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files[0])}
      />
      {isUploading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div className="spinner" style={{ width: 32, height: 32 }}></div>
          <h4>Processing Document...</h4>
          <p>Extracting and parsing text content</p>
        </div>
      ) : (
        <>
          <span className="upload-icon">📄</span>
          <h4>Drop your clinical document here</h4>
          <p>or <span className="browse-btn">browse files</span> from your computer</p>
          <div style={{
            display: 'flex', gap: 12, marginTop: 16, justifyContent: 'center',
            fontSize: 12, color: 'var(--text-muted)'
          }}>
            <span style={{ padding: '4px 12px', background: 'var(--accent-light)', borderRadius: 20, color: 'var(--accent)', fontWeight: 600 }}>PDF</span>
            <span style={{ padding: '4px 12px', background: 'var(--accent-light)', borderRadius: 20, color: 'var(--accent)', fontWeight: 600 }}>DOCX</span>
            <span style={{ padding: '4px 12px', background: 'var(--accent-light)', borderRadius: 20, color: 'var(--accent)', fontWeight: 600 }}>TXT</span>
          </div>
          <p style={{ marginTop: 8, fontSize: 11 }}>Maximum file size: 20MB</p>
        </>
      )}
    </div>
  );
}
