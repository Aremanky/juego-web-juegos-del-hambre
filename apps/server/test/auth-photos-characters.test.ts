import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, character, cookieFrom, makeJpeg, register, resetDatabase, startServer, uploadPhoto, type TestServer, type TestUser } from './helpers';
import { config } from '../src/config';

let srv: TestServer;
let ana: TestUser;
let beto: TestUser;

beforeAll(async () => {
  await resetDatabase();
  srv = await startServer();
  ana = await register(srv.url, 'ana');
  beto = await register(srv.url, 'beto');
});
afterAll(async () => srv.close());

describe('registro e inicio de sesión', () => {
  it('el primer usuario es administrador y los demás no', async () => {
    expect((await api(srv.url, '/api/auth/me', { cookie: ana.cookie })).body.user.role).toBe('admin');
    expect((await api(srv.url, '/api/auth/me', { cookie: beto.cookie })).body.user.role).toBe('user');
  });

  it('rechaza usuarios duplicados (sin distinguir mayúsculas)', async () => {
    const r = await api(srv.url, '/api/auth/register', { body: { username: 'ANA', displayName: 'Otra', password: 'contraseña-larga' } });
    expect(r.status).toBe(409);
  });

  it('valida los datos de registro', async () => {
    const r = await api(srv.url, '/api/auth/register', { body: { username: 'x', displayName: 'X', password: '123' } });
    expect(r.status).toBe(400);
  });

  it('login correcto e incorrecto', async () => {
    expect((await api(srv.url, '/api/auth/login', { body: { username: 'ana', password: 'mala-contraseña' } })).status).toBe(401);
    const ok = await api(srv.url, '/api/auth/login', { body: { username: 'Ana', password: 'contraseña-larga' } });
    expect(ok.status).toBe(200);
    const cookie = cookieFrom(ok.headers);
    expect(ok.headers.getSetCookie()[0]).toMatch(/HttpOnly/i);
    expect(ok.headers.getSetCookie()[0]).toMatch(/Max-Age=2592000/);
    expect((await api(srv.url, '/api/auth/me', { cookie })).status).toBe(200);
  });

  it('cerrar sesión invalida la cookie', async () => {
    const login = await api(srv.url, '/api/auth/login', { body: { username: 'beto', password: 'contraseña-larga' } });
    const cookie = cookieFrom(login.headers);
    expect((await api(srv.url, '/api/auth/logout', { method: 'POST', cookie })).status).toBe(200);
    expect((await api(srv.url, '/api/auth/me', { cookie })).status).toBe(401);
  });

  it('cambiar la contraseña cierra las otras sesiones', async () => {
    const u = await register(srv.url, 'carla');
    const other = cookieFrom((await api(srv.url, '/api/auth/login', { body: { username: 'carla', password: 'contraseña-larga' } })).headers);
    const r = await api(srv.url, '/api/users/me/password', { body: { currentPassword: 'contraseña-larga', newPassword: 'otra-contraseña-larga' }, cookie: u.cookie });
    expect(r.status).toBe(200);
    expect((await api(srv.url, '/api/auth/me', { cookie: u.cookie })).status).toBe(200);
    // la caché de sesión dura 30 s: la otra sesión ya no existe en BD y se invalida en caché
    expect((await api(srv.url, '/api/auth/me', { cookie: other })).status).toBe(401);
  });

  it('bloquea peticiones de otro origen (CSRF)', async () => {
    const res = await fetch(srv.url + '/api/rooms', { method: 'POST', headers: { cookie: ana.cookie, origin: 'https://malicioso.example', 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Sala' }) });
    expect(res.status).toBe(403);
  });

  it('exige código de registro si está configurado', async () => {
    const s2 = await startServer({ registrationCode: 'amigos2026' });
    try {
      expect((await api(s2.url, '/api/server-info')).body.registrationRequiresCode).toBe(true);
      expect((await api(s2.url, '/api/auth/register', { body: { username: 'intruso', displayName: 'Intruso', password: 'contraseña-larga' } })).status).toBe(403);
      expect((await api(s2.url, '/api/auth/register', { body: { username: 'amiga', displayName: 'Amiga', password: 'contraseña-larga', registrationCode: 'amigos2026' } })).status).toBe(201);
    } finally {
      await s2.close();
    }
  });
});

describe('biblioteca de fotos', () => {
  let photoId: string;

  it('sube, normaliza y genera las versiones', async () => {
    const r = await uploadPhoto(srv.url, ana.cookie, await makeJpeg(1200, 800), { label: 'Playa', tags: JSON.stringify(['verano']) });
    expect(r.status).toBe(201);
    photoId = r.body.photo.id;
    expect(r.body.photo).toMatchObject({ label: 'Playa', tags: ['verano'], width: 1200, height: 800, v: 1, isDefault: true });
    // recorte por defecto: cuadrado centrado
    expect(r.body.photo.crop.w * 1200).toBeCloseTo(800, 0);
    for (const variant of ['original', 'avatar', 'marker', 'thumb']) {
      const res = await fetch(`${srv.url}/api/photos/${photoId}/${variant}?v=1`, { headers: { cookie: ana.cookie } });
      expect(res.status, variant).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/webp');
    }
    const me = await api(srv.url, '/api/auth/me', { cookie: ana.cookie });
    expect(me.body.user.defaultPhoto).toEqual({ id: photoId, v: 1 });
  });

  it('el original no supera 2048 px', async () => {
    const r = await uploadPhoto(srv.url, ana.cookie, await makeJpeg(3000, 1500));
    expect(r.body.photo.width).toBe(2048);
    expect(r.body.photo.height).toBe(1024);
  });

  it('reajusta el recorte sin perder el original (versión nueva)', async () => {
    const r = await api(srv.url, `/api/photos/${photoId}`, { method: 'PATCH', cookie: ana.cookie, body: { crop: { x: 0, y: 0, w: 0.5, h: 0.75 }, label: 'Retrato', tags: ['yo', 'arena'] } });
    expect(r.status).toBe(200);
    expect(r.body.photo).toMatchObject({ v: 2, label: 'Retrato', tags: ['yo', 'arena'] });
    const dir = join(config.uploadDir, 'photos', ana.id, photoId);
    expect(existsSync(join(dir, 'original.webp'))).toBe(true);
    expect(existsSync(join(dir, 'avatar.v2.webp'))).toBe(true);
    const cached = await fetch(`${srv.url}/api/photos/${photoId}/avatar?v=2`, { headers: { cookie: ana.cookie } });
    expect(cached.headers.get('cache-control')).toContain('immutable');
    const etag = cached.headers.get('etag')!;
    const notModified = await fetch(`${srv.url}/api/photos/${photoId}/avatar?v=2`, { headers: { cookie: ana.cookie, 'if-none-match': etag } });
    expect(notModified.status).toBe(304);
  });

  it('rechaza archivos que no son imágenes y los demasiado grandes', async () => {
    const fd = new FormData();
    fd.append('file', new Blob([new TextEncoder().encode('esto no es una imagen')], { type: 'image/jpeg' }), 'falso.jpg');
    expect((await api(srv.url, '/api/photos', { method: 'POST', cookie: ana.cookie, form: fd })).status).toBe(415);
    const big = Buffer.alloc(5 * 1024 * 1024, 7);
    expect((await uploadPhoto(srv.url, ana.cookie, big)).status).toBe(413);
  });

  it('protege las fotos: sin sesión no se ven y nadie modifica las de otro', async () => {
    expect((await fetch(`${srv.url}/api/photos/${photoId}/avatar`)).status).toBe(401);
    expect((await api(srv.url, `/api/photos/${photoId}`, { method: 'PATCH', cookie: beto.cookie, body: { label: 'mía' } })).status).toBe(404);
    expect((await api(srv.url, `/api/photos/${photoId}`, { method: 'DELETE', cookie: beto.cookie })).status).toBe(404);
  });

  it('lista, cambia la predeterminada y borra', async () => {
    const list = await api(srv.url, '/api/photos', { cookie: ana.cookie });
    expect(list.body.photos.length).toBe(2);
    const other = list.body.photos.find((p: { id: string }) => p.id !== photoId);
    await api(srv.url, `/api/photos/${other.id}`, { method: 'PATCH', cookie: ana.cookie, body: { isDefault: true } });
    expect((await api(srv.url, '/api/auth/me', { cookie: ana.cookie })).body.user.defaultPhoto.id).toBe(other.id);
    expect((await api(srv.url, `/api/photos/${other.id}`, { method: 'DELETE', cookie: ana.cookie })).status).toBe(200);
    expect(existsSync(join(config.uploadDir, 'photos', ana.id, other.id))).toBe(false);
    expect((await api(srv.url, '/api/auth/me', { cookie: ana.cookie })).body.user.defaultPhoto).toBeNull();
  });
});

describe('plantillas de personaje', () => {
  it('guarda, lista, duplica, edita y borra', async () => {
    const photos = await api(srv.url, '/api/photos', { cookie: ana.cookie });
    const pid = photos.body.photos[0].id;
    const data = character({ name: 'Kira', gender: 'F', district: 4, portrait: { kind: 'photo', photoId: pid, v: 0 } });
    const c = await api(srv.url, '/api/characters', { body: { data }, cookie: ana.cookie });
    expect(c.status).toBe(201);
    expect(c.body.template.data.portrait.v).toBe(2); // el servidor fija la versión real de la foto
    const dup = await api(srv.url, `/api/characters/${c.body.template.id}/duplicate`, { method: 'POST', cookie: ana.cookie });
    expect(dup.body.template.name).toBe('Kira (copia)');
    const upd = await api(srv.url, `/api/characters/${c.body.template.id}`, { method: 'PUT', body: { data: { ...data, name: 'Kira la Roja' } }, cookie: ana.cookie });
    expect(upd.body.template.name).toBe('Kira la Roja');
    expect((await api(srv.url, '/api/characters', { cookie: ana.cookie })).body.templates.length).toBe(2);
    expect((await api(srv.url, `/api/characters/${dup.body.template.id}`, { method: 'DELETE', cookie: ana.cookie })).status).toBe(200);
    // persiste entre sesiones/dispositivos: otra sesión ve la misma plantilla
    const other = cookieFrom((await api(srv.url, '/api/auth/login', { body: { username: 'ana', password: 'contraseña-larga' } })).headers);
    expect((await api(srv.url, '/api/characters', { cookie: other })).body.templates[0].name).toBe('Kira la Roja');
  });

  it('rechaza builds inválidos y fotos ajenas', async () => {
    const over = character({ attributes: { potencia: 10, reflejos: 10, aguante: 10, instinto: 5, sigilo: 5, ingenio: 5, carisma: 5 } });
    expect((await api(srv.url, '/api/characters', { body: { data: over }, cookie: beto.cookie })).status).toBe(400);
    const photos = await api(srv.url, '/api/photos', { cookie: ana.cookie });
    const stolen = character({ portrait: { kind: 'photo', photoId: photos.body.photos[0].id, v: 1 } });
    const r = await api(srv.url, '/api/characters', { body: { data: stolen }, cookie: beto.cookie });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toMatch(/tu propia biblioteca/);
  });
});
