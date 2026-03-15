"use client"

import { useEffect, useRef } from "react"
import { useDropZone } from "@/hooks/use-dropzone"
import { Upload } from "lucide-react"

interface DropZoneProps {
  onDrop: (files: File[]) => void
  children: React.ReactNode
}

export function DropZone({ onDrop, children }: DropZoneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { isDragging, handleDragEnter, handleDragLeave, handleDragOver, handleDrop } = useDropZone(onDrop)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    el.addEventListener("dragenter", handleDragEnter)
    el.addEventListener("dragleave", handleDragLeave)
    el.addEventListener("dragover", handleDragOver)
    el.addEventListener("drop", handleDrop)

    return () => {
      el.removeEventListener("dragenter", handleDragEnter)
      el.removeEventListener("dragleave", handleDragLeave)
      el.removeEventListener("dragover", handleDragOver)
      el.removeEventListener("drop", handleDrop)
    }
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop])

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {children}

      {/* Full-page overlay when dragging */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center
          bg-primary/10 border-2 border-dashed border-primary rounded-xl
          backdrop-blur-sm pointer-events-none transition-all">
          <Upload className="w-12 h-12 text-primary mb-3 animate-bounce" />
          <p className="text-primary font-semibold text-lg">Drop your file here</p>
          <p className="text-muted-foreground text-sm mt-1">Supports PDF, FHIR JSON, XML and more</p>
        </div>
      )}
    </div>
  )
}