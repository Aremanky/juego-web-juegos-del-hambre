import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { photoUrl, type Crop, type PhotoDTO } from '@ceniza/shared';
import { ConfirmButton, Empty, Modal, Spinner } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { keys, usePhotos } from '../../lib/queries';
import { toast } from '../../stores/toast';
import { CropEditor, PhotoUploader } from './photoWidgets';

export function PhotosPage() {
  const { data: photos, isLoading } = usePhotos();
  const [editing, setEditing] = useState<PhotoDTO | null>(null);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Tus fotos</h1>
          <p className="muted" style={{ margin: 0 }}>
            Se guardan en el servidor: en la próxima partida solo tendrás que elegirlas.
          </p>
        </div>
        <PhotoUploader />
      </div>
      {isLoading && <Spinner />}
      {!isLoading && !photos?.length && (
        <Empty title="Aún no tienes fotos">
          <p>Sube una foto para que tus amigos te reconozcan en el mapa, en la sala y en los combates.</p>
          <PhotoUploader label="Subir mi primera foto" />
        </Empty>
      )}
      <div className="photo-grid">
        {photos?.map((p) => (
          <button key={p.id} type="button" className="photo-tile" onClick={() => setEditing(p)}>
            <span className="photo-thumb">
              <img src={photoUrl(p.id, 'thumb', p.v)} alt="" loading="lazy" />
            </span>
            <span className="photo-face">
              <img src={photoUrl(p.id, 'marker', p.v)} alt="" />
            </span>
            <span className="photo-meta">
              <strong>{p.label || 'Sin nombre'}</strong>
              {p.isDefault && (
                <span className="chip chip-gold">
                  <Star /> Predeterminada
                </span>
              )}
              {p.tags.map((t) => (
                <span key={t} className="chip">
                  {t}
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>
      {editing && <PhotoEditModal photo={editing} onClose={() => setEditing(null)} />}
    </main>
  );
}

function PhotoEditModal({ photo, onClose }: { photo: PhotoDTO; onClose: () => void }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState(photo.label);
  const [tags, setTags] = useState(photo.tags.join(', '));
  const [crop, setCrop] = useState<Crop>(photo.crop);
  const [busy, setBusy] = useState(false);

  const cropChanged = Math.abs(crop.x - photo.crop.x) + Math.abs(crop.y - photo.crop.y) + Math.abs(crop.w - photo.crop.w) > 0.002;

  const save = async (extra: { isDefault?: true } = {}) => {
    setBusy(true);
    try {
      const tagList = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8);
      await api.patch(`/api/photos/${photo.id}`, { label, tags: tagList, ...(cropChanged ? { crop } : {}), ...extra });
      await qc.invalidateQueries({ queryKey: keys.photos });
      void qc.invalidateQueries({ queryKey: keys.me });
      toast.success(extra.isDefault ? 'Ahora es tu foto predeterminada' : 'Cambios guardados');
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await api.del(`/api/photos/${photo.id}`);
      await qc.invalidateQueries({ queryKey: keys.photos });
      void qc.invalidateQueries({ queryKey: keys.me });
      toast.success('Foto borrada');
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Modal
      title="Editar foto"
      onClose={onClose}
      width={600}
      footer={
        <>
          <ConfirmButton onConfirm={remove} confirmText="¿Borrarla? Pulsa otra vez">
            Borrar
          </ConfirmButton>
          <span className="spacer" />
          {!photo.isDefault && (
            <button className="btn btn-gold" onClick={() => save({ isDefault: true })} disabled={busy}>
              Usar como predeterminada
            </button>
          )}
          <button className="btn btn-primary" onClick={() => save()} disabled={busy}>
            Guardar cambios
          </button>
        </>
      }
    >
      <div className="stack">
        <CropEditor src={photoUrl(photo.id, 'original', photo.v)} initial={photo.crop} onChange={setCrop} />
        <label className="field">
          <span>Nombre</span>
          <input className="input" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="field">
          <span>Etiquetas</span>
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="verano, serio, disfraz" />
          <span className="hint">Sepáralas con comas. Máximo 8.</span>
        </label>
      </div>
    </Modal>
  );
}
