'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Upload, X, User as UserIcon } from 'lucide-react';
import HiddenCsrfInput from './HiddenCsrfInput';
import { sanitizeIconUrl } from '../lib/sanitizeIconUrl';
import { useSession } from 'next-auth/react';
import { useCsrfToken } from './CsrfProvider';

interface ProfileImageUploaderProps {
    currentImage?: string | null;
    onUpdate: (formData: FormData) => Promise<{ status: 'success' | 'error'; message: string; image?: string }>;
}

export default function ProfileImageUploader({ currentImage: propImage, onUpdate }: ProfileImageUploaderProps) {
    const [isPending, startTransition] = useTransition();
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [statusTone, setStatusTone] = useState<'success' | 'error' | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const { data: session, update } = useSession();
    const csrfToken = useCsrfToken();

    // Prioritize session image so it updates reactively without page refresh
    const currentImage = session?.user?.image || propImage;

    const safePreviewUrl = useMemo(() => sanitizeIconUrl(previewUrl || currentImage), [previewUrl, currentImage]);

    useEffect(() => {
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);

        const file = formData.get('image') as File;
        if (file && file.size > 2 * 1024 * 1024) {
            setStatusMessage('File too large (maximum 2MB)');
            setStatusTone('error');
            return;
        }

        formData.set('csrfToken', csrfToken);
        setStatusMessage(null);
        setStatusTone(null);

        startTransition(async () => {
            try {
                const result = await onUpdate(formData);
                if (result.status === 'success') {
                    setStatusMessage(result.message);
                    setStatusTone('success');
                    setFileName(null);

                    // Update session with the new image path from server
                    if (result.image) {
                        await update({ image: result.image });
                    }

                    // Clear preview only after session update is triggered
                    // This prevents the "flicker" back to the old image
                    setPreviewUrl(null);
                } else {
                    setStatusMessage(result.message);
                    setStatusTone('error');
                }
            } catch (err) {
                console.error('Error updating profile image:', err);
                setStatusMessage('Unable to update profile image.');
                setStatusTone('error');
            }
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <HiddenCsrfInput />
            <div className="flex flex-col items-center gap-6">
                <div className="relative">
                    <div className="h-32 w-32 rounded-full bg-white/5 border-2 border-dashed border-white/10 flex items-center justify-center overflow-hidden shadow-xl group">
                        {safePreviewUrl ? (
                            <img src={safePreviewUrl} alt="Profile preview" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        ) : (
                            <UserIcon className="h-16 w-16 text-ink-500" />
                        )}

                        <input
                            type="file"
                            name="image"
                            id="profile-image-upload"
                            accept="image/png,image/jpeg,image/svg+xml"
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (!file) {
                                    setPreviewUrl(null);
                                    setFileName(null);
                                    return;
                                }
                                setFileName(file.name);
                                if (previewUrl) {
                                    URL.revokeObjectURL(previewUrl);
                                }
                                setPreviewUrl(URL.createObjectURL(file));
                            }}
                            className="sr-only"
                        />
                        <label
                            htmlFor="profile-image-upload"
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 backdrop-blur-[2px]"
                        >
                            <Upload className="h-6 w-6 text-white mb-1" />
                            <span className="text-[10px] text-white font-medium uppercase tracking-wider">Change</span>
                        </label>
                    </div>

                    {fileName && (
                        <button
                            type="button"
                            onClick={() => {
                                setFileName(null);
                                setPreviewUrl(null);
                                const input = document.getElementById('profile-image-upload') as HTMLInputElement;
                                if (input) input.value = '';
                            }}
                            className="absolute -top-1 -right-1 p-1.5 rounded-full bg-rose-500 text-white shadow-lg hover:bg-rose-600 transition-colors"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    )}
                </div>

                <div className="text-center space-y-1">
                    <h3 className="text-sm font-medium text-ink-100">Profile Icon</h3>
                    <p className="text-xs text-ink-400">PNG, JPEG or SVG (max 2MB)</p>
                    {fileName && <p className="text-xs text-ocean-400 font-medium">Selected: {fileName}</p>}
                </div>

                {fileName && (
                    <button
                        type="submit"
                        disabled={isPending}
                        className="btn-primary w-full py-2 text-sm shadow-glass"
                    >
                        {isPending ? 'Saving...' : 'Save Profile Icon'}
                    </button>
                )}

                {statusMessage && (
                    <p className={`text-xs font-medium text-center ${statusTone === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {statusMessage}
                    </p>
                )}
            </div>
        </form>
    );
}
