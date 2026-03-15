import { useState, useCallback, useRef } from "react"

export function useDropZone(onDrop: (files: File[]) => void) {
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    if (e.dataTransfer?.items?.length) setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragging(false)
  }, [])

    const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy"
    }
    }, [])

    const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounter.current = 0

    // Try files first
    const files = Array.from(e.dataTransfer?.files ?? [])
    if (files.length) {
        onDrop(files)
        return
    }

    // Fallback: read from items if files is empty
    const items = Array.from(e.dataTransfer?.items ?? [])
    const fileItems = items
        .filter(item => item.kind === "file")
        .map(item => item.getAsFile())
        .filter((f): f is File => f !== null)

    if (fileItems.length) onDrop(fileItems)
    }, [onDrop])
    return { isDragging, handleDragEnter, handleDragLeave, handleDragOver, handleDrop }
}