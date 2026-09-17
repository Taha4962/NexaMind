"use client";

/**
 * NexaMind Frontend — Documents Manager Page
 *
 * Provides:
 *   - Drag-and-drop document uploader supporting PDF, DOCX, TXT with progress tracking
 *   - Grid vs List view toggle
 *   - Document cards with status badges (uploaded, processing, ready, failed)
 *   - Automatic background polling every 3s while any document is processing
 *   - Retry action for failed documents
 *   - Delete confirmation modal
 */

import { useState, useMemo, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  FileText,
  Upload,
  Search,
  Grid,
  List,
  Trash2,
  RotateCw,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Clock,
  Layers,
  File,
  X,
} from "lucide-react";
import {
  useDocuments,
  useUploadDocument,
  useDeleteDocument,
  useRetryDocument,
  type DocumentItem,
} from "@/hooks/useDocuments";

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "Recently";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Recently";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getFileTypeIcon(fileType?: string) {
  const norm = (fileType || "").toLowerCase();
  if (norm === "pdf") {
    return { icon: FileText, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" };
  }
  if (norm === "docx") {
    return { icon: FileText, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" };
  }
  return { icon: File, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" };
}

export default function DocumentsPage() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Upload state
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Delete modal state
  const [documentToDelete, setDocumentToDelete] = useState<DocumentItem | null>(null);

  const { documents, isProcessing, isLoading } = useDocuments();
  const uploadMutation = useUploadDocument();
  const deleteMutation = useDeleteDocument();
  const retryMutation = useRetryDocument();

  // Drag and drop handler
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!acceptedFiles || acceptedFiles.length === 0) return;
      const file = acceptedFiles[0];
      setUploadingFileName(file.name);
      setUploadProgress(0);
      setUploadError(null);

      try {
        await uploadMutation.mutateAsync({
          file,
          onProgress: (percent) => setUploadProgress(percent),
        });
        setUploadProgress(100);
        setTimeout(() => {
          setShowUploadModal(false);
          setUploadProgress(null);
          setUploadingFileName(null);
        }, 600);
      } catch (err: any) {
        setUploadError(
          err.response?.data?.message || err.message || "Upload failed. Please try again."
        );
        setUploadProgress(null);
      }
    },
    [uploadMutation]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/plain": [".txt"],
    },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
  });

  // Filtered documents
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const matchesSearch =
        doc.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.originalName && doc.originalName.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchesStatus = true;
      if (statusFilter === "ready") {
        matchesStatus = doc.status === "ready" || doc.status === "completed";
      } else if (statusFilter === "processing") {
        matchesStatus =
          doc.status === "processing" ||
          doc.status === "uploaded" ||
          doc.status === "pending";
      } else if (statusFilter === "failed") {
        matchesStatus = doc.status === "failed";
      }

      return matchesSearch && matchesStatus;
    });
  }, [documents, searchQuery, statusFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = documents.length;
    const ready = documents.filter((d) => d.status === "ready" || d.status === "completed").length;
    const processing = documents.filter(
      (d) => d.status === "processing" || d.status === "uploaded" || d.status === "pending"
    ).length;
    const totalChunks = documents.reduce((acc, d) => acc + (d.chunkCount || 0), 0);
    return { total, ready, processing, totalChunks };
  }, [documents]);

  const handleDeleteConfirm = async () => {
    if (!documentToDelete) return;
    const id = documentToDelete.id || documentToDelete._id;
    if (id) {
      await deleteMutation.mutateAsync(id);
    }
    setDocumentToDelete(null);
  };

  const handleRetry = async (doc: DocumentItem) => {
    const id = doc.id || doc._id;
    if (id) {
      await retryMutation.mutateAsync(id);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <FileText className="w-4 h-4" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Document Manager</h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Upload PDFs, DOCX, and text files to power your RAG-driven knowledge base.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Polling status pulse */}
          {isProcessing && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Processing documents...</span>
            </div>
          )}

          {/* Upload Button */}
          <button
            onClick={() => {
              setUploadError(null);
              setUploadProgress(null);
              setShowUploadModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all shadow-md glow-primary"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Document</span>
          </button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-card border border-border">
          <span className="text-xs text-muted-foreground font-medium">Total Documents</span>
          <p className="text-2xl font-bold text-foreground mt-1">{stats.total}</p>
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border">
          <span className="text-xs text-muted-foreground font-medium">Ready for RAG</span>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{stats.ready}</p>
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border">
          <span className="text-xs text-muted-foreground font-medium">Indexed Chunks</span>
          <p className="text-2xl font-bold text-blue-400 mt-1">{stats.totalChunks}</p>
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border">
          <span className="text-xs text-muted-foreground font-medium">Ingestion Pipeline</span>
          <div className="flex items-center gap-1.5 mt-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isProcessing ? "bg-amber-400 animate-ping" : "bg-emerald-400"
              }`}
            />
            <span className="text-xs font-semibold text-foreground">
              {isProcessing ? "Processing" : "Idle & Ready"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Search, Filters & View Toggle ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status filters */}
          <div className="flex items-center bg-card border border-border p-1 rounded-xl">
            {[
              { id: "all", label: "All" },
              { id: "ready", label: "Ready" },
              { id: "processing", label: "Processing" },
              { id: "failed", label: "Failed" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === f.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents..."
              className="w-full pl-8 pr-8 py-1.5 rounded-xl bg-card border border-border text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* View mode toggle (Grid / List) */}
        <div className="flex items-center self-end sm:self-auto bg-card border border-border p-1 rounded-xl">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-lg transition-colors ${
              viewMode === "grid"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Grid view"
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-lg transition-colors ${
              viewMode === "list"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Document List / Grid ── */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading documents...</p>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="py-16 px-4 rounded-2xl bg-card border border-border text-center flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4 glow-primary">
            <FileText className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-foreground mb-1.5">
            {searchQuery
              ? "No matching documents"
              : statusFilter !== "all"
              ? `No ${statusFilter} documents`
              : "No documents uploaded yet"}
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
            {searchQuery
              ? "Try adjusting your search query or status filter."
              : "Upload PDF, DOCX, or TXT documents. NexaMind will chunk, embed, and index them so you can ask detailed questions in chat."}
          </p>
          {!searchQuery && statusFilter === "all" && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all shadow-md"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload your first document</span>
            </button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        /* ── Grid View ── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocuments.map((doc) => {
            const docId = doc.id || doc._id || "";
            const { icon: FileIcon, color: iconColor, bg: iconBg } = getFileTypeIcon(
              doc.fileType
            );
            const isReady = doc.status === "ready" || doc.status === "completed";
            const isProcessingDoc =
              doc.status === "processing" ||
              doc.status === "uploaded" ||
              doc.status === "pending";
            const isFailed = doc.status === "failed";

            return (
              <div
                key={docId}
                className="group relative rounded-2xl bg-card border border-border p-4 hover:border-primary/40 hover:shadow-lg transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  {/* Top row: File Icon & Delete button */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${iconBg} ${iconColor}`}
                      >
                        <FileIcon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4
                          className="text-sm font-semibold text-foreground truncate"
                          title={doc.originalName || doc.filename}
                        >
                          {doc.originalName || doc.filename}
                        </h4>
                        <span className="text-[11px] text-muted-foreground uppercase font-medium">
                          {doc.fileType} • {formatFileSize(doc.fileSize || doc.sizeBytes)}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => setDocumentToDelete(doc)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete document"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Status & Chunks */}
                  <div className="space-y-2 mb-3">
                    {isReady && (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Ready</span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Layers className="w-3 h-3" />
                          <span>{doc.chunkCount || 0} chunks indexed</span>
                        </span>
                      </div>
                    )}

                    {isProcessingDoc && (
                      <div className="space-y-1.5">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-400 animate-pulse">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Processing & Chunking...</span>
                        </span>
                      </div>
                    )}

                    {isFailed && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 border border-red-500/20 text-red-400">
                            <AlertCircle className="w-3 h-3" />
                            <span>Failed</span>
                          </span>

                          <button
                            onClick={() => handleRetry(doc)}
                            disabled={retryMutation.isPending}
                            className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                          >
                            <RotateCw className="w-3 h-3" />
                            <span>Retry</span>
                          </button>
                        </div>
                        {doc.errorMessage && (
                          <p className="text-[11px] text-red-400/80 line-clamp-2">
                            {doc.errorMessage}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer timestamp */}
                <div className="pt-3 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatDate(doc.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── List View ── */
        <div className="rounded-2xl bg-card border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface/50 border-b border-border text-muted-foreground font-semibold">
                <tr>
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Chunks</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Uploaded</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredDocuments.map((doc) => {
                  const docId = doc.id || doc._id || "";
                  const { icon: FileIcon, color: iconColor } = getFileTypeIcon(doc.fileType);
                  const isReady = doc.status === "ready" || doc.status === "completed";
                  const isProcessingDoc =
                    doc.status === "processing" ||
                    doc.status === "uploaded" ||
                    doc.status === "pending";
                  const isFailed = doc.status === "failed";

                  return (
                    <tr key={docId} className="hover:bg-surface/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5 max-w-xs sm:max-w-md truncate">
                          <FileIcon className={`w-4 h-4 flex-shrink-0 ${iconColor}`} />
                          <span className="font-semibold text-foreground truncate">
                            {doc.originalName || doc.filename}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isReady && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                            Ready
                          </span>
                        )}
                        {isProcessingDoc && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-400 animate-pulse">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Processing
                          </span>
                        )}
                        {isFailed && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 border border-red-500/20 text-red-400">
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {doc.chunkCount ? `${doc.chunkCount} chunks` : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatFileSize(doc.fileSize || doc.sizeBytes)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(doc.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isFailed && (
                            <button
                              onClick={() => handleRetry(doc)}
                              className="p-1 text-primary hover:underline font-medium text-xs"
                            >
                              Retry
                            </button>
                          )}
                          <button
                            onClick={() => setDocumentToDelete(doc)}
                            className="p-1 rounded text-muted-foreground hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Upload Modal (Drag & Drop) ── */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Upload className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-foreground">Upload Documents</h3>
              </div>
              <button
                onClick={() => {
                  if (!uploadProgress) setShowUploadModal(false);
                }}
                disabled={Boolean(uploadProgress)}
                className="p-1 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drag & Drop Zone */}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
                isDragActive
                  ? "border-primary bg-primary/10 scale-[0.99]"
                  : "border-border/80 hover:border-primary/50 hover:bg-surface/50"
              }`}
            >
              <input {...getInputProps()} />
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto mb-3">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">
                {isDragActive
                  ? "Drop document here..."
                  : "Drag & drop your file here, or click to browse"}
              </p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Supports PDF, DOCX, and TXT files up to 10MB each.
              </p>
            </div>

            {/* File Rejections error */}
            {fileRejections.length > 0 && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>
                  {fileRejections[0].errors[0]?.message || "Invalid file format or size."}
                </span>
              </div>
            )}

            {/* Upload Progress */}
            {uploadProgress !== null && (
              <div className="space-y-2 p-3 rounded-xl bg-surface border border-border">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground truncate max-w-[200px]">
                    {uploadingFileName}
                  </span>
                  <span className="text-primary font-semibold">{uploadProgress}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error Message */}
            {uploadError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {documentToDelete && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 flex-shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Delete Document?
                </h3>
                <p className="text-xs text-muted-foreground truncate max-w-[240px]">
                  {documentToDelete.originalName || documentToDelete.filename}
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              This will permanently delete the document from Cloudinary and remove its
              indexed vector chunks from ChromaDB. RAG queries will no longer reference it.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDocumentToDelete(null)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                Delete Document
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
