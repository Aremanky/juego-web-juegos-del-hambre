import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import type { ChatMessageDTO } from '@ceniza/shared';
import { emitAck, SocketFailure } from '../lib/socket';
import { photoRefSrc } from '../lib/media';
import { toast } from '../stores/toast';

const time = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

export function ChatPanel({ channel, messages, placeholder, disabled }: { channel: 'global' | 'room'; messages: ChatMessageDTO[]; placeholder: string; disabled?: boolean }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = logRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await emitAck('chat:send', { channel, body });
      setText('');
      stick.current = true;
    } catch (err) {
      toast.error(err instanceof SocketFailure ? err.message : 'No se pudo enviar el mensaje');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat">
      <div
        className="chat-log"
        ref={logRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        aria-live="polite"
      >
        {messages.length === 0 && <p className="faint small">Todavía no hay mensajes.</p>}
        {messages.map((m) =>
          m.system ? (
            <div key={m.id} className="chat-msg system">
              {m.body}
            </div>
          ) : (
            <div key={m.id} className="chat-msg">
              <img src={photoRefSrc(m.user.photo, m.user.id, 28)} alt="" width={28} height={28} style={{ borderRadius: '50%', objectFit: 'cover' }} />
              <div>
                <b>{m.user.displayName}</b>
                <time dateTime={m.createdAt}>{time(m.createdAt)}</time>
                <div style={{ overflowWrap: 'anywhere' }}>{m.body}</div>
              </div>
            </div>
          ),
        )}
      </div>
      <form className="chat-form" onSubmit={send}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={400} placeholder={placeholder} disabled={disabled} aria-label="Mensaje" />
        <button className="btn btn-icon" type="submit" disabled={disabled || sending || !text.trim()} aria-label="Enviar">
          <Send />
        </button>
      </form>
    </div>
  );
}
