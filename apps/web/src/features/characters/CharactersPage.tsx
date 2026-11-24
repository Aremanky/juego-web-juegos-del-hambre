import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { ATTRIBUTE_KEYS, ATTRIBUTES, MAX_TEMPLATE_BUDGET, PLAYER_COLORS, defaultCharacter, districtById, summarizeBuild, type Character, type TemplateDTO } from '@ceniza/shared';
import { ConfirmButton, Empty, Portrait, Spinner } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { keys, useMe, useSaveTemplate, useTemplates } from '../../lib/queries';
import { toast } from '../../stores/toast';
import { CharacterEditor } from './CharacterEditor';

export function CharactersPage() {
  const { data: templates, isLoading } = useTemplates();
  const qc = useQueryClient();

  const duplicate = async (t: TemplateDTO) => {
    try {
      await api.post(`/api/characters/${t.id}/duplicate`);
      await qc.invalidateQueries({ queryKey: keys.templates });
      toast.success('Personaje duplicado');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const remove = async (t: TemplateDTO) => {
    try {
      await api.del(`/api/characters/${t.id}`);
      await qc.invalidateQueries({ queryKey: keys.templates });
      toast.success(`${t.name} borrado`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Tus personajes</h1>
          <p className="muted" style={{ margin: 0 }}>
            Guarda configuraciones completas y recupéralas en cualquier sala, desde cualquier dispositivo.
          </p>
        </div>
        <Link to="/personajes/nuevo" className="btn btn-primary">
          Nuevo personaje
        </Link>
      </div>
      {isLoading && <Spinner />}
      {!isLoading && !templates?.length && (
        <Empty title="Aún no tienes personajes">
          <p>Crea uno con tu foto, reparte sus atributos y elige sus habilidades. La próxima vez que entres en una sala se cargará solo.</p>
          <Link to="/personajes/nuevo" className="btn btn-primary">
            Crear mi personaje
          </Link>
        </Empty>
      )}
      <div className="sheet-grid">
        {templates?.map((t) => {
          const d = districtById(t.data.district);
          const valid = summarizeBuild(t.data, 28).valid;
          return (
            <article key={t.id} className="sheet">
              <Link to={`/personajes/${t.id}`} className="sheet-top">
                <Portrait portrait={t.data.portrait} look={t.data.look} color={t.data.color} frame={t.data.frame} size={72} />
                <div>
                  <h3 className="sheet-name">{t.data.name}</h3>
                  {t.data.epithet && <div className="muted small">{t.data.epithet}</div>}
                  <div className="small faint">{d ? `Distrito ${d.roman}, ${d.name}` : 'Cualquier distrito'}</div>
                </div>
              </Link>
              <div className="sheet-bars" aria-label="Atributos">
                {ATTRIBUTE_KEYS.map((k) => (
                  <div key={k} className="sheet-bar" title={`${ATTRIBUTES[k].name}: ${t.data.attributes[k]}`}>
                    <span style={{ height: `${t.data.attributes[k] * 10}%` }} />
                    <small>{ATTRIBUTES[k].short}</small>
                  </div>
                ))}
              </div>
              {!valid && <p className="small faint">Usa más de 28 puntos: en salas de 28 tendrás que ajustarlo.</p>}
              <div className="sheet-actions">
                <Link to={`/personajes/${t.id}`} className="btn btn-sm">
                  Editar
                </Link>
                <button className="btn btn-sm btn-ghost" onClick={() => duplicate(t)}>
                  Duplicar
                </button>
                <span className="spacer" />
                <ConfirmButton className="btn btn-sm btn-danger" confirmText="¿Seguro?" onConfirm={() => remove(t)}>
                  <Trash2 />
                </ConfirmButton>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}

export function CharacterEditPage() {
  const { id } = useParams();
  const isNew = !id || id === 'nuevo';
  const { data: me } = useMe();
  const { data: templates, isLoading } = useTemplates();
  const save = useSaveTemplate();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Character | null>(null);

  useEffect(() => {
    if (draft || !me) return;
    if (isNew) {
      const base = defaultCharacter({ name: me.displayName, seed: me.id, color: PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)] });
      setDraft(me.defaultPhoto ? { ...base, portrait: { kind: 'photo', photoId: me.defaultPhoto.id, v: me.defaultPhoto.v } } : base);
    } else if (templates) {
      const t = templates.find((x) => x.id === id);
      if (t) setDraft(structuredClone(t.data));
    }
  }, [draft, me, isNew, templates, id]);

  if (!isNew && !isLoading && templates && !templates.find((x) => x.id === id)) {
    return (
      <main className="page">
        <Empty title="Ese personaje no existe">
          <Link to="/personajes" className="btn">
            Volver a tus personajes
          </Link>
        </Empty>
      </main>
    );
  }
  if (!draft) {
    return (
      <div className="center-fill">
        <Spinner />
      </div>
    );
  }

  const summary = summarizeBuild(draft, MAX_TEMPLATE_BUDGET);
  const submit = async (asNew = false) => {
    try {
      const t = await save.mutateAsync({ id: isNew || asNew ? undefined : id, data: draft });
      toast.success(`${t.name} guardado`);
      navigate(`/personajes/${t.id}`, { replace: true });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <main className="page">
      <Link to="/personajes" className="back">
        <ChevronLeft size={18} /> Tus personajes
      </Link>
      <div className="page-head">
        <h1>{isNew ? 'Nuevo personaje' : draft.name}</h1>
        <div className="row">
          {!isNew && (
            <button className="btn" onClick={() => submit(true)} disabled={save.isPending || !summary.valid}>
              Guardar como nuevo
            </button>
          )}
          <button className="btn btn-primary" onClick={() => submit(false)} disabled={save.isPending || !summary.valid}>
            Guardar personaje
          </button>
        </div>
      </div>
      <p className="muted small">Las plantillas admiten hasta {MAX_TEMPLATE_BUDGET} puntos; cada sala fija su propio límite (24, 28 o 32).</p>
      <CharacterEditor value={draft} onChange={setDraft} budget={MAX_TEMPLATE_BUDGET} mode="template" />
    </main>
  );
}
