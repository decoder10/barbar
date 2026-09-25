import { ImagePlus, RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';
import { ApiError, api } from '../../../services/api-client';
import { t } from '../../../presentation/i18n/runtime';

/**
 * A phone photo is several megabytes: shrink it in the browser, then the server re-encodes it for the
 * cards. A format the browser cannot draw is sent as is and the server answers with a clear refusal.
 */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return (await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.88))) || file;
  } catch {
    return file;
  }
}

/** Owner only: upload the item's own photo or return to the library photo. Saved with the item. */
export function OwnPhotoField({
  photo,
  onChange,
}: {
  photo?: string;
  onChange: (photo: string | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const upload = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      const body = await shrink(file);
      const result = await api('/api/barbar/photos', {
        method: 'POST',
        body,
        headers: { 'Content-Type': body.type || 'application/octet-stream' },
      });
      onChange(result.photo);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось загрузить фото.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="own-photo-field">
      <div className="own-photo-actions">
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={17} />
          {t(busy ? 'Загрузка фото…' : photo ? 'Заменить своё фото' : 'Загрузить своё фото')}
        </button>
        {photo && (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => onChange(undefined)}
          >
            <RotateCcw size={16} />
            {t('Вернуть фото из библиотеки')}
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void upload(file);
          }}
        />
      </div>
      <p className="form-help own-photo-help">
        {t('Своё фото сохраняется вместе с позицией и заменяет пример в меню, продажах и на складе.')}
      </p>
      {error && (
        <p className="own-photo-error" role="alert">
          {t(error)}
        </p>
      )}
    </div>
  );
}
