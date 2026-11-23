import { useCallback, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { photoUrl, type Crop, type PhotoDTO } from '@ceniza/shared';
import { Modal, Spinner } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { normalizeImageFile } from '../../lib/media';
import { keys, usePhotos } from '../../lib/queries';
import { toast } from '../../stores/toast';

const toCrop = (a: Area): Crop => {
  const x = Math.max(0, Math.min(1, a.x / 100));
  const y = Math.max(0, Math.min(1, a.y / 100));
  return { x, y, w: Math.max(0.01, Math.min(1 - x, a.width / 100)), h: Math.max(0.01, Math.min(1 - y, a.height / 100)) };
};

/** Recorte circular no destructivo (el original se conserva en el servidor). */
export function CropEditor({ src, initial, onChange }: { src: string; initial?: Crop; onChange: (c: Crop) => void }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  return (
    <div className="crop">
      <div className="crop-stage">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          maxZoom={5}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(area) => onChange(toCrop(area))}
          initialCroppedAreaPercentages={initial ? { x: initial.x * 100, y: initial.y * 100, width: initial.w * 100, height: initial.h * 100 } : undefined}
        />
      </div>
      <label className="field">
        <span>Zoom</span>
        <input type="range" min={1} max={5} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom del recorte" />
      </label>
      <p className="hint">Arrastra para centrar tu cara. Así aparecerás en el mapa y en la clasificación.</p>
    </div>
  );
}

/** Botón «Subir foto» + recorte + subida. Llama a onUploaded con la foto creada. */
export function PhotoUploader({ onUploaded, label = 'Subir foto', className = 'btn btn-primary' }: { onUploaded?: (p: PhotoDTO) => void; label?: string; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [pending, setPending] = useState<{ blob: Blob; url: string } | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const n = await normalizeImageFile(file);
      setPending({ blob: n.blob, url: n.url });
      setName(file.name.replace(/\.[^.]+$/, '').slice(0, 40));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      if (input.current) input.current.value = '';
    }
  };

  const close = useCallback(() => {
    if (pending) URL.revokeObjectURL(pending.url);
    setPending(null);
    setCrop(null);
  }, [pending]);

  const upload = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('label', name);
      if (crop) fd.append('crop', JSON.stringify(crop));
      fd.append('file', pending.blob, 'foto.jpg');
      const res = await api.upload<{ photo: PhotoDTO }>('/api/photos', fd);
      await qc.invalidateQueries({ queryKey: keys.photos });
      void qc.invalidateQueries({ queryKey: keys.me });
      toast.success('Foto guardada en tu biblioteca');
      onUploaded?.(res.photo);
      close();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={() => input.current?.click()}>
        {label}
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      {pending && (
        <Modal
          title="Ajusta tu foto"
          onClose={close}
          width={560}
          footer={
            <>
              <button className="btn btn-ghost" onClick={close}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={upload} disabled={busy}>
                {busy ? 'Subiendo…' : 'Guardar foto'}
              </button>
            </>
          }
        >
          <div className="stack">
            <CropEditor src={pending.url} onChange={setCrop} />
            <label className="field">
              <span>Nombre de la foto</span>
              <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Por ejemplo: la del cumpleaños" />
            </label>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Selector de foto de la biblioteca, con subida rápida. */
export function PhotoPicker({ selectedId, onSelect, onClose, title = 'Elige una foto' }: { selectedId?: string | null; onSelect: (p: PhotoDTO) => void; onClose: () => void; title?: string }) {
  const { data: photos, isLoading } = usePhotos();
  return (
    <Modal title={title} onClose={onClose} width={720} footer={<PhotoUploader label="Subir otra" className="btn" onUploaded={(p) => onSelect(p)} />}>
      {isLoading && <Spinner />}
      {!isLoading && !photos?.length && <p className="muted">Tu biblioteca está vacía. Sube una foto y quedará guardada para próximas partidas.</p>}
      <div className="picker-grid">
        {photos?.map((p) => (
          <button key={p.id} type="button" className={`picker-item${p.id === selectedId ? ' selected' : ''}`} onClick={() => onSelect(p)} aria-pressed={p.id === selectedId}>
            <img src={photoUrl(p.id, 'avatar', p.v)} alt="" loading="lazy" />
            <span className="small">{p.label || 'Sin nombre'}</span>
            {p.isDefault && <Star className="picker-star" size={14} aria-label="Predeterminada" />}
          </button>
        ))}
      </div>
    </Modal>
  );
}
