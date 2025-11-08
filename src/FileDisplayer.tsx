import React, { ReactElement, createElement, useState, useEffect, useCallback, useRef } from "react";
import { FileDisplayerContainerProps } from "../typings/FileDisplayerProps";
import "./ui/FileDisplayer.css";

type FileType = "image" | "pdf" | "download";
type ToolType = "pen" | "arrow";

type Point = {
    x: number;
    y: number;
};

type PenAnnotation = {
    type: "pen";
    color: string;
    points: Point[];
};

type ArrowAnnotation = {
    type: "arrow";
    color: string;
    start: Point;
    end: Point;
};

type Annotation = PenAnnotation | ArrowAnnotation;

const imageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];

const getFileExtension = (filename: string): string => {
    return filename.split(".").pop()?.toLowerCase() || "";
};

const getFileType = (filename: string): FileType => {
    const ext = getFileExtension(filename);
    if (imageExtensions.includes(ext)) {
        return "image";
    }
    if (ext === "pdf") {
        return "pdf";
    }
    return "download";
};

const clampColorTemperature = (value?: number | null): number => {
    if (typeof value !== "number" || Number.isNaN(value)) {
        return 0;
    }
    return Math.min(100, Math.max(0, value));
};

const getColorTemperatureFilter = (intensity: number): string => {
    if (intensity <= 0) {
        return "none";
    }

    const ratio = intensity / 100;
    const sepia = (0.75 * ratio).toFixed(2);
    const saturate = (1 + 0.6 * ratio).toFixed(2);
    const hueRotate = (16 * ratio).toFixed(2);

    return `sepia(${sepia}) saturate(${saturate}) hue-rotate(${hueRotate}deg)`;
};

export function FileDisplayer({
    file,
    class: className,
    style,
    colorTemperature
}: FileDisplayerContainerProps): ReactElement {
    const [fileUrl, setFileUrl] = useState<string | null>(null);
    const [filename, setFilename] = useState<string>("");
    const [error, setError] = useState<string>("");
    const [zoom, setZoom] = useState<number>(1);
    const [rotation, setRotation] = useState<number>(0);
    const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [activeTool, setActiveTool] = useState<ToolType>("pen");
    const [annotationColor, setAnnotationColor] = useState<string>("#ff0000");
    const [annotationEnabled, setAnnotationEnabled] = useState<boolean>(false);
    const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
    const [penSize, setPenSize] = useState<number>(3);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const currentAnnotationIndexRef = useRef<number | null>(null);
    const isDrawingRef = useRef<boolean>(false);

    useEffect(() => {
        if (!file) {
            setError("No file selected");
            setFileUrl(null);
            return;
        }

        if (file.status !== "available" || !file.value) {
            setError("File not available");
            setFileUrl(null);
            return;
        }

        const uri = file.value.uri;
        if (!uri) {
            setError("Invalid file URL");
            setFileUrl(null);
            return;
        }

        const name = file.value.name || uri.split("/").pop() || "file";
        const fileType = getFileType(name);

        setFilename(name);
        setError("");
        setZoom(1);
        setRotation(0);
        setPosition({ x: 0, y: 0 });
        setIsLoading(true);
        setAnnotations([]);
        setImageDimensions({ width: 0, height: 0 });

        if (fileType === "image") {
            setFileUrl(uri);
            setIsLoading(false);
        } else if (fileType === "pdf") {
            // For PDFs, use blob URL to display in iframe
            fetch(uri)
                .then(response => response.blob())
                .then(blob => {
                    const blobUrl = URL.createObjectURL(blob);
                    setFileUrl(blobUrl);
                    setIsLoading(false);
                })
                .catch(err => {
                    console.error("Failed to fetch PDF:", err);
                    setFileUrl(uri);
                    setIsLoading(false);
                });
        } else {
            // For all other files (Office, etc.) - just download
            setFileUrl(null);
            setIsLoading(false);
        }

        // Cleanup will be handled by separate effect
    }, [file]);

    // Cleanup blob URLs when component unmounts or fileUrl changes
    useEffect(() => {
        return () => {
            if (fileUrl && fileUrl.startsWith("blob:")) {
                URL.revokeObjectURL(fileUrl);
            }
        };
    }, [fileUrl]);

    const handleZoomIn = (): void => {
        setZoom(prev => Math.min(prev + 0.25, 5));
    };

    const handleZoomOut = (): void => {
        setZoom(prev => Math.max(prev - 0.25, 0.25));
    };

    const handleReset = (): void => {
        setZoom(1);
        setRotation(0);
        setPosition({ x: 0, y: 0 });
    };

    const handleRotate = (): void => {
        setRotation(prev => (prev + 90) % 360);
    };

    const handleDownload = (): void => {
        if (!file || !file.value || !file.value.uri) {
            return;
        }

        const link = document.createElement("a");
        link.href = file.value.uri;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleMouseDown = (e: React.MouseEvent): void => {
        if (!annotationEnabled || getFileType(filename) !== "image") {
            return;
        }
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e: React.MouseEvent): void => {
        if (!isDragging || getFileType(filename) !== "image") {
            return;
        }
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    };

    const handleMouseUp = (): void => {
        setIsDragging(false);
    };

    const drawAnnotationsToContext = useCallback(
        (ctx: CanvasRenderingContext2D, annotationsToDraw: Annotation[]): void => {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            annotationsToDraw.forEach(annotation => {
                if (annotation.type === "pen") {
                    if (annotation.points.length === 0) {
                        return;
                    }
                    ctx.strokeStyle = annotation.color;
                    ctx.lineJoin = "round";
                    ctx.lineCap = "round";
                    ctx.lineWidth = penSize;
                    ctx.beginPath();
                    const [firstPoint, ...restPoints] = annotation.points;
                    ctx.moveTo(firstPoint.x, firstPoint.y);
                    restPoints.forEach(point => {
                        ctx.lineTo(point.x, point.y);
                    });
                    if (annotation.points.length === 1) {
                        ctx.lineTo(firstPoint.x + 0.1, firstPoint.y + 0.1);
                    }
                    ctx.stroke();
                } else if (annotation.type === "arrow") {
                    const { start, end, color } = annotation;
                    const dx = end.x - start.x;
                    const dy = end.y - start.y;
                    const length = Math.sqrt(dx * dx + dy * dy);
                    if (length < 2) {
                        return;
                    }

                    const ux = dx / length;
                    const uy = dy / length;
                    const px = -uy;
                    const py = ux;

                    const sizeMultiplier = Math.max(penSize / 3, 0.4);
                    const baseWidth = Math.min(Math.max(length * 0.08, 4), 8) * sizeMultiplier;
                    const shaftWidth = baseWidth * 1.4;
                    const headLength = Math.min(Math.max(length * 0.28, 14), 28) * sizeMultiplier;
                    const headWidth = shaftWidth * 2.4;

                    const headBaseX = end.x - ux * headLength;
                    const headBaseY = end.y - uy * headLength;

                    const tailLeft = {
                        x: start.x + px * (baseWidth / 2),
                        y: start.y + py * (baseWidth / 2)
                    };
                    const tailRight = {
                        x: start.x - px * (baseWidth / 2),
                        y: start.y - py * (baseWidth / 2)
                    };
                    const shaftLeft = {
                        x: headBaseX + px * (shaftWidth / 2),
                        y: headBaseY + py * (shaftWidth / 2)
                    };
                    const shaftRight = {
                        x: headBaseX - px * (shaftWidth / 2),
                        y: headBaseY - py * (shaftWidth / 2)
                    };
                    const headLeft = {
                        x: headBaseX + px * (headWidth / 2),
                        y: headBaseY + py * (headWidth / 2)
                    };
                    const headRight = {
                        x: headBaseX - px * (headWidth / 2),
                        y: headBaseY - py * (headWidth / 2)
                    };

                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.moveTo(tailLeft.x, tailLeft.y);
                    ctx.lineTo(shaftLeft.x, shaftLeft.y);
                    ctx.lineTo(headLeft.x, headLeft.y);
                    ctx.lineTo(end.x, end.y);
                    ctx.lineTo(headRight.x, headRight.y);
                    ctx.lineTo(shaftRight.x, shaftRight.y);
                    ctx.lineTo(tailRight.x, tailRight.y);
                    ctx.closePath();
                    ctx.fill();

                    ctx.strokeStyle = color;
                    ctx.lineJoin = "round";
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            });
        },
        [penSize]
    );

    const refreshCanvas = useCallback((): void => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return;
        }
        drawAnnotationsToContext(ctx, annotations);
    }, [annotations, drawAnnotationsToContext]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !imageDimensions.width || !imageDimensions.height) {
            return;
        }
        canvas.width = imageDimensions.width;
        canvas.height = imageDimensions.height;
        refreshCanvas();
    }, [imageDimensions, refreshCanvas]);

    useEffect(() => {
        refreshCanvas();
    }, [annotations, refreshCanvas]);

    const getCanvasPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>): Point | null => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return null;
        }
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width ? canvas.width / rect.width : 1;
        const scaleY = rect.height ? canvas.height / rect.height : 1;
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY
        };
    }, []);

    const handleCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
        if (getFileType(filename) !== "image") {
            return;
        }
        const canvas = canvasRef.current;
        const point = getCanvasPoint(event);
        if (!canvas || !point) {
            return;
        }
        canvas.setPointerCapture(event.pointerId);
        isDrawingRef.current = true;

        if (activeTool === "pen") {
            const newAnnotation: PenAnnotation = {
                type: "pen",
                color: annotationColor,
                points: [point]
            };
            setAnnotations(prev => {
                const next = [...prev, newAnnotation];
                currentAnnotationIndexRef.current = next.length - 1;
                return next;
            });
        } else {
            const newAnnotation: ArrowAnnotation = {
                type: "arrow",
                color: annotationColor,
                start: point,
                end: point
            };
            setAnnotations(prev => {
                const next = [...prev, newAnnotation];
                currentAnnotationIndexRef.current = next.length - 1;
                return next;
            });
        }
    };

    const handleCanvasPointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
        if (!isDrawingRef.current || currentAnnotationIndexRef.current === null) {
            return;
        }
        const point = getCanvasPoint(event);
        if (!point) {
            return;
        }
        const annotationIndex = currentAnnotationIndexRef.current;
        setAnnotations(prev => {
            if (annotationIndex === null || annotationIndex >= prev.length) {
                return prev;
            }
            const next = [...prev];
            const currentAnnotation = next[annotationIndex];
            if (!currentAnnotation) {
                return prev;
            }
            if (currentAnnotation.type === "pen") {
                const updated: PenAnnotation = {
                    ...currentAnnotation,
                    points: [...currentAnnotation.points, point]
                };
                next[annotationIndex] = updated;
            } else {
                const updated: ArrowAnnotation = {
                    ...currentAnnotation,
                    end: point
                };
                next[annotationIndex] = updated;
            }
            return next;
        });
    };

    const stopDrawing = (event: React.PointerEvent<HTMLCanvasElement>): void => {
        const canvas = canvasRef.current;
        if (canvas) {
            try {
                canvas.releasePointerCapture(event.pointerId);
            } catch (error) {
                // Ignore release errors
            }
        }
        isDrawingRef.current = false;
        currentAnnotationIndexRef.current = null;
    };

    const handleCanvasPointerUp = (event: React.PointerEvent<HTMLCanvasElement>): void => {
        if (!isDrawingRef.current) {
            return;
        }
        stopDrawing(event);
    };

    const handleCanvasPointerLeave = (event: React.PointerEvent<HTMLCanvasElement>): void => {
        if (!isDrawingRef.current) {
            return;
        }
        stopDrawing(event);
    };

    const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>): void => {
        const target = event.target as HTMLImageElement;
        setImageDimensions({ width: target.naturalWidth, height: target.naturalHeight });
    };

    const handleToolSelect = (tool: ToolType): void => {
        setActiveTool(prevTool => {
            if (prevTool === tool) {
                setAnnotationEnabled(prevEnabled => !prevEnabled);
                return prevTool;
            }
            setAnnotationEnabled(true);
            return tool;
        });
    };

    const handleUndoAnnotation = (): void => {
        setAnnotations(prev => prev.slice(0, -1));
    };

    const normalizedColorTemperature = clampColorTemperature(colorTemperature);
    const contentFilter = getColorTemperatureFilter(normalizedColorTemperature);

    const renderViewer = (): ReactElement => {
        if (isLoading) {
            return (
                <div className="widget-file-viewer-empty">
                    <p>Loading file...</p>
                </div>
            );
        }

        const fileType = getFileType(filename);
        const isImage = fileType === "image";
        const isPDF = fileType === "pdf";
        const showControls = isImage || isPDF;

        if (!showControls) {
            return (
                <div className="widget-file-viewer-download-only">
                    <div className="widget-file-viewer-file-info">
                        <span className="widget-file-viewer-file-icon">📄</span>
                        <span className="widget-file-viewer-file-name">{filename}</span>
                    </div>
                    <button className="widget-file-viewer-btn-large" onClick={handleDownload} type="button">
                        <span className="widget-file-viewer-icon">↓</span>
                        Download
                    </button>
                </div>
            );
        }

        return (
            <div className="widget-file-viewer-container">
                <div className="widget-file-viewer-toolbar">
                    {isImage && (
                        <div className="widget-file-viewer-toolbar-group">
                            <button
                                className={`widget-file-viewer-btn ${
                                    annotationEnabled && activeTool === "pen" ? "widget-file-viewer-btn-active" : ""
                                }`}
                                onClick={() => handleToolSelect("pen")}
                                title={
                                    annotationEnabled && activeTool === "pen" ? "Disable pen tool" : "Enable pen tool"
                                }
                                type="button"
                            >
                                ✎
                            </button>
                            <button
                                className={`widget-file-viewer-btn ${
                                    annotationEnabled && activeTool === "arrow" ? "widget-file-viewer-btn-active" : ""
                                }`}
                                onClick={() => handleToolSelect("arrow")}
                                title={
                                    annotationEnabled && activeTool === "arrow"
                                        ? "Disable arrow tool"
                                        : "Enable arrow tool"
                                }
                                type="button"
                            >
                                ➤
                            </button>
                            <input
                                aria-label="Annotation color"
                                className="widget-file-viewer-color-picker"
                                disabled={!annotationEnabled}
                                type="color"
                                value={annotationColor}
                                onChange={event => setAnnotationColor(event.target.value)}
                            />
                            <label className="widget-file-viewer-pen-size" title="Pen size">
                                <input
                                    type="range"
                                    min="1"
                                    max="15"
                                    step="1"
                                    value={penSize}
                                    onChange={event => setPenSize(Number(event.target.value))}
                                    disabled={!annotationEnabled}
                                />
                                <span>{penSize}px</span>
                            </label>
                            <button
                                className="widget-file-viewer-btn"
                                onClick={handleUndoAnnotation}
                                title="Undo annotation"
                                type="button"
                                disabled={annotations.length === 0}
                            >
                                ↶
                            </button>
                        </div>
                    )}
                    <button className="widget-file-viewer-btn" onClick={handleZoomIn} title="Zoom In" type="button">
                        <span className="widget-file-viewer-icon">⊕</span>
                    </button>
                    <button className="widget-file-viewer-btn" onClick={handleZoomOut} title="Zoom Out" type="button">
                        <span className="widget-file-viewer-icon">⊖</span>
                    </button>
                    <button
                        className="widget-file-viewer-btn"
                        onClick={handleRotate}
                        title="Rotate"
                        type="button"
                        disabled={!isImage}
                    >
                        <span className="widget-file-viewer-icon">↻</span>
                    </button>
                    <button className="widget-file-viewer-btn" onClick={handleReset} title="Reset" type="button">
                        <span className="widget-file-viewer-icon">⌂</span>
                    </button>
                    <button
                        className="widget-file-viewer-btn widget-file-viewer-btn-primary"
                        onClick={handleDownload}
                        title="Download"
                        type="button"
                    >
                        <span className="widget-file-viewer-icon">↓</span>
                    </button>
                </div>
                <div
                    className="widget-file-viewer-content"
                    style={contentFilter === "none" ? undefined : { filter: contentFilter }}
                >
                    {isImage && (
                        <div
                            className="widget-file-viewer-image-wrapper"
                            style={{
                                transform: `rotate(${rotation}deg) scale(${zoom}) translate(${position.x}px, ${position.y}px)`
                            }}
                        >
                            <img
                                ref={imageRef}
                                src={fileUrl || undefined}
                                alt={filename}
                                className="widget-file-viewer-image"
                                style={{
                                    cursor: isDragging ? "grabbing" : "grab"
                                }}
                                draggable={false}
                                onLoad={handleImageLoad}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={handleMouseUp}
                            />
                            <canvas
                                ref={canvasRef}
                                className="widget-file-viewer-annotation-canvas"
                                style={{ pointerEvents: annotationEnabled ? "auto" : "none" }}
                                onPointerDown={handleCanvasPointerDown}
                                onPointerMove={handleCanvasPointerMove}
                                onPointerUp={handleCanvasPointerUp}
                                onPointerLeave={handleCanvasPointerLeave}
                            />
                        </div>
                    )}
                    {isPDF && <iframe src={fileUrl || undefined} className="widget-file-viewer-pdf" title={filename} />}
                </div>
            </div>
        );
    };

    return (
        <div className={`widget-file-viewer ${className}`} style={style}>
            {error ? (
                <div className="widget-file-viewer-error">
                    <p>{error}</p>
                </div>
            ) : (
                renderViewer()
            )}
        </div>
    );
}
