"use client";

import React, { useRef, useState, useEffect, useMemo } from "react";
import { useTheme } from './ThemeProvider';
import { Upload, X } from 'lucide-react';

type Props = {
  name: string;
  label?: string;
  current?: string | null;
  recommendedSize?: string;
  maxWidth?: number;
  maxHeight?: number;
};

async function resizeImageFile(file: File, maxWidth = 480, maxHeight = 96): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas 2D context unavailable"));
        ctx.drawImage(img, 0, 0, w, h);
        const mime = file.type === "image/jpeg" || file.type === "image/jpg" ? "image/jpeg" : "image/png";
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("Canvas toBlob produced no data"));
            const newFile = new File([blob], file.name, { type: mime });
            resolve(newFile);
          },
          mime,
          mime === "image/jpeg" ? 0.9 : undefined
        );
      };
      img.onerror = (e) => reject(e);
      img.src = String(reader.result);
    };
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

export default function LogoUpload({ name, label, current, recommendedSize, maxWidth = 480, maxHeight = 96 }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(current ?? null);
  const [removed, setRemoved] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [prevPreview, setPrevPreview] = useState<string | null>(null);
  const [prevFileName, setPrevFileName] = useState<string | null>(null);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resized = await resizeImageFile(file, maxWidth, maxHeight);
      // Replace the input.files with the resized file so form submission sends it
      const dt = new DataTransfer();
      dt.items.add(resized as File);
      if (inputRef.current) inputRef.current.files = dt.files;
      if (preview) URL.revokeObjectURL(preview);
      const url = URL.createObjectURL(resized);
      setPreview(url);
      setFileName(resized.name ?? file.name);
      setRemoved(false);
    } catch (err) {
      // fallback to original file
      if (preview) URL.revokeObjectURL(preview);
      const url = URL.createObjectURL(file);
      setPreview(url);
      setFileName(file.name);
      setRemoved(false);
    }
  };

  const removalInputName = `remove${name[0].toUpperCase()}${name.slice(1)}`;

  const confirmRemove = () => {
    if (!preview && !current) return;
    setPrevPreview(preview);
    setPrevFileName(fileName);
    if (inputRef.current) {
      const dt = new DataTransfer();
      inputRef.current.files = dt.files;
    }
    setPreview(null);
    setFileName(null);
    setRemoved(true);
  };

  const undoRemove = () => {
    setPreview(prevPreview);
    setFileName(prevFileName);
    setPrevPreview(null);
    setPrevFileName(null);
    setRemoved(false);
  };

  const inputId = `logo-upload-${name}`;

  const { theme } = useTheme();
  const targetTheme = name.toLowerCase().includes('light') ? 'light' : name.toLowerCase().includes('dark') ? 'dark' : theme;

  const previewBox = (
    <div
      className={
        `w-32 h-12 rounded flex items-center justify-center overflow-hidden` +
        (targetTheme === 'dark'
          ? ' bg-ink-800/30 border border-white/5'
          : ' bg-white border')
      }
    >
      {preview ? <img src={preview} alt="preview" className="max-h-12" /> : <span className="text-xs text-ink-400">No logo</span>}
    </div>
  );

  return (
    <div className="space-y-2">
      {label && <label className="text-xs uppercase tracking-[0.2em] text-ink-400">{label}</label>}
      <div className="flex items-center space-x-4">
        {previewBox}
        <div className="space-y-1 w-full">
          <input
            ref={inputRef}
            type="file"
            id={inputId}
            name={name}
            onChange={onChange}
            accept="image/png,image/jpeg"
            className="sr-only"
          />
          <label htmlFor={inputId} className="file-upload-zone">
            <Upload className="file-upload-icon text-ink-400 group-hover:text-ocean-400 transition-colors" />
            <div className="text-center">
              <p className="file-upload-title">{fileName ? fileName : 'Click to upload logo'}</p>
              <p className="file-upload-description">PNG or JPEG (max 2MB)</p>
            </div>
            {fileName && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setFileName(null);
                  if (preview) {
                    URL.revokeObjectURL(preview);
                    setPreview(null);
                  }
                  const input = document.getElementById(inputId) as HTMLInputElement;
                  if (input) input.value = '';
                }}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-ink-400 hover:text-white transition-all shadow-sm"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>

          {recommendedSize && <div className="text-xs text-ink-400">Recommended: {recommendedSize}</div>}

          <div className="flex items-center gap-2 mt-2">
            {removed ? (
              <>
                <span className="text-xs text-red-600">Marked for removal</span>
                <button type="button" onClick={undoRemove} className="btn-secondary btn-small">Undo</button>
              </>
            ) : (
              preview || current ? (
                <button type="button" onClick={confirmRemove} className="btn-secondary btn-small">Remove</button>
              ) : null
            )}
          </div>
          {removed ? <input type="hidden" name={removalInputName} value="1" /> : null}
        </div>
      </div>
      {/* removal is marked immediately; Save/Submit will persist the change */}
    </div>
  );
}
