import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { avatarSvg } from '../packages/shared/src/game/avatar';

const SHOTS = 'e2e/.artifacts/screens';
const shot = (page: Page, name: string, fullPage = true) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });

/** Imagen de prueba (un retrato generado rasterizado) para subir como «foto». */
async function fakePhoto(seed: string, color: string): Promise<Buffer> {
  const svg = avatarSvg(seed, color).replace('viewBox="0 0 128 128"', 'viewBox="0 0 128 128" width="900" height="700" preserveAspectRatio="xMidYMid slice"');
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

async function registerViaUi(page: Page, username: string) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Los Juegos/ })).toBeVisible();
  await page.getByRole('link', { name: 'Crear cuenta' }).click();
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña').fill('contraseña-larga');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: `Hola, ${username}` })).toBeVisible();
}

test('dos amigos preparan una partida juntos en tiempo real', async ({ browser }) => {
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  // ── Portada y registro
  await a.goto('/');
  await a.waitForTimeout(1500);
  await shot(a, '01-inicio');
  await registerViaUi(a, 'Aremanky');
  await shot(a, '02-menu');

  // ── Biblioteca de fotos: subir, recortar y guardar
  await a.getByRole('link', { name: 'Fotos', exact: true }).click();
  await a.locator('input[type=file]').first().setInputFiles({ name: 'yo.jpg', mimeType: 'image/jpeg', buffer: await fakePhoto('aremanky', '#3f88c5') });
  await expect(a.getByRole('heading', { name: 'Ajusta tu foto' })).toBeVisible();
  await a.getByLabel('Nombre de la foto').fill('Retrato serio');
  await a.waitForTimeout(400);
  await shot(a, '03-recorte');
  await a.getByRole('button', { name: 'Guardar foto' }).click();
  await expect(a.getByText('Retrato serio')).toBeVisible();
  await expect(a.getByText('Predeterminada')).toBeVisible();
  await shot(a, '04-fotos');

  // ── Plantilla de personaje con la foto
  await a.getByRole('link', { name: 'Personajes', exact: true }).click();
  await a.getByRole('link', { name: 'Nuevo personaje' }).first().click();
  await a.getByRole('button', { name: 'Cazador' }).click();
  await expect(a.locator('.budget-num')).toHaveText('28 / 32');
  await a.waitForTimeout(300);
  await shot(a, '05-editor-atributos');
  await a.getByRole('tab', { name: 'Identidad' }).click();
  await a.getByLabel('Nombre del personaje').fill('Kael');
  await a.getByLabel('Epíteto (opcional)').fill('el Implacable');
  await a.getByRole('button', { name: 'VII Aserraderos' }).click();
  await shot(a, '06-editor-identidad');
  await a.getByRole('tab', { name: 'Habilidades y rasgos' }).click();
  await shot(a, '07-editor-habilidades');

  // ── Desglose de estadísticas y prueba de fuerza (fase 5)
  await a.getByRole('tab', { name: 'Atributos' }).click();
  await a.getByRole('button', { name: /^Velocidad/ }).click();
  await expect(a.locator('.why')).toContainText('Solo depende de los atributos');
  await expect(a.locator('.situational')).toContainText('+12 % de velocidad en el bosque');
  await expect(a.locator('.situational')).toContainText('Daño recibido ×1,15 siempre');
  await shot(a, '17-editor-desglose');
  await a.getByRole('tab', { name: 'Prueba de fuerza' }).click();
  await expect(a.getByText('de media contra los arquetipos')).toBeVisible({ timeout: 20_000 });
  await expect(a.locator('table.strength tbody tr')).toHaveCount(5);
  await expect(a.getByText(/combates simulados por casilla/)).toBeVisible({ timeout: 20_000 });
  await shot(a, '18-prueba-de-fuerza');
  await a.getByRole('button', { name: 'Guardar personaje' }).click();
  await expect(a.getByRole('heading', { name: 'Kael' })).toBeVisible();

  // ── Crear sala
  await a.getByRole('link', { name: 'Menú', exact: true }).click();
  await a.getByRole('link', { name: 'Crear sala' }).first().click();
  await shot(a, '08-crear-sala');
  await a.getByRole('button', { name: 'Crear sala' }).click();
  await expect(a.getByRole('heading', { name: 'Tablero de distritos' })).toBeVisible();
  const code = (await a.locator('.code-big').textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  // La plantilla se aplica sola al entrar, con su distrito preferido
  await expect(a.locator('.slot.mine')).toBeVisible();

  // ── El amigo entra desde el móvil con el enlace de invitación
  await registerViaUi(b, 'Lucia');
  await b.goto(`/r/${code}`);
  await expect(b.getByText('Te han invitado a una sala')).toBeVisible();
  await b.getByRole('button', { name: 'Unirme a la sala' }).click();
  await expect(b.getByRole('tab', { name: /Sala \(2\// })).toBeVisible();
  await expect(a.locator('.prow')).toHaveCount(2);

  // ── Cualquiera añade bots
  await b.getByRole('button', { name: 'AÑADIR BOT' }).click();
  await expect(a.locator('.prow')).toHaveCount(3);
  await b.waitForTimeout(400);
  await b.getByRole('button', { name: 'AÑADIR BOT' }).click();
  await expect(a.locator('.prow')).toHaveCount(4);
  await expect(a.getByText('Lo añadió Lucia').first()).toBeVisible();

  // ── El anfitrión edita un bot que añadió la amiga; ella ve el cambio
  await a.locator('.prow', { hasText: 'Lo añadió Lucia' }).first().locator('.prow-main').click();
  await expect(a.getByRole('heading', { name: /Bot|[A-Z]/ }).first()).toBeVisible();
  await a.getByRole('button', { name: 'Experto' }).click();
  await shot(a, '09-editor-bot');
  await a.getByRole('button', { name: 'Guardar cambios' }).click();
  await a.locator('.modal-foot').getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(b.getByText(/experto/).first()).toBeVisible();

  // ── La amiga crea su personaje en la sala y ocupa plaza
  await b.getByRole('tab', { name: 'Mi personaje' }).click();
  await b.getByRole('button', { name: 'Crear personaje' }).click();
  await b.getByRole('button', { name: 'Sombra' }).click();
  await b.getByRole('tab', { name: 'Identidad' }).click();
  await b.getByLabel('Nombre del personaje').fill('Nara');
  await b.getByRole('button', { name: 'Femenino' }).click();
  await b.getByRole('tab', { name: 'Prueba de fuerza' }).click();
  await expect(b.getByText(/combates simulados por casilla/)).toBeVisible({ timeout: 30_000 });
  await shot(b, '19-prueba-de-fuerza-movil');
  await b.getByRole('button', { name: 'Guardar en la sala' }).click();
  await expect(b.locator('.mychar-name')).toHaveText('Nara');
  await b.getByRole('tab', { name: /Sala/ }).click();
  await b.locator('.slot.claimable').first().click();
  await expect(b.locator('.slot.mine')).toBeVisible();
  await shot(b, '10-sala-movil');

  // ── Chat de sala en tiempo real
  await b.getByRole('tab', { name: 'Chat' }).click();
  await b.getByLabel('Mensaje').fill('¡Que empiecen los juegos!');
  await b.getByRole('button', { name: 'Enviar' }).click();
  await expect(a.locator('.lobby-chat').getByText('¡Que empiecen los juegos!')).toBeVisible();
  await a.setViewportSize({ width: 1440, height: 1380 });
  await a.evaluate(() => window.scrollTo(0, 0));
  await a.waitForTimeout(500);
  await shot(a, '11-sala-escritorio', false);
  await a.setViewportSize({ width: 1440, height: 900 });
  await shot(b, '12-chat-movil');

  // ── Reconexión: recargar la página no saca de la sala ni pierde el personaje
  await b.reload();
  await expect(b.getByRole('tab', { name: /Sala \(4\// })).toBeVisible();
  await b.getByRole('tab', { name: 'Mi personaje' }).click();
  await expect(b.locator('.mychar-name')).toHaveText('Nara');

  // ── La sesión se recuerda en el mismo navegador
  const fresh = await ctxA.newPage();
  await fresh.goto('/');
  await expect(fresh).toHaveURL(/\/menu$/);
  await expect(fresh.getByText('Tus salas abiertas')).toBeVisible();
  await fresh.close();

  // ── Ambos se preparan: cuenta atrás de sala y empieza la partida sola
  await b.getByRole('button', { name: 'Estoy listo' }).click();
  await a.getByRole('button', { name: 'Estoy listo' }).click();
  await expect(a.getByText(/La partida empieza en/)).toBeVisible();
  await expect(b.getByText(/La partida empieza en/)).toBeVisible();

  // ── Fase 4: sobrevuelo de la arena, presentación, cuenta atrás y arena en tiempo real
  await expect(a.getByRole('heading', { name: 'La arena', exact: true })).toBeVisible({ timeout: 10_000 });
  await a.waitForTimeout(700);
  await shot(a, '20-sobrevuelo', false);
  await expect(a.getByRole('heading', { name: 'Los Elegidos' })).toBeVisible({ timeout: 10_000 });
  await expect(b.locator('.map-canvas')).toBeVisible();
  await a.waitForTimeout(900);
  await shot(a, '13-presentacion');
  await expect(a.getByText(/Nadie se mueve hasta el final/)).toBeVisible({ timeout: 10_000 });
  await expect(a.getByText('Toca una casilla para ir.', { exact: false })).toBeVisible({ timeout: 10_000 });
  await expect(b.getByText('Toca una casilla para ir.', { exact: false })).toBeVisible();

  // Un toque en el mapa es una orden de ir: aparece «Parar» mientras camina.
  const box = (await a.locator('.map-canvas').boundingBox())!;
  await a.mouse.click(box.x + box.width / 2 + 70, box.y + box.height / 2 + 40);
  await expect(a.getByRole('button', { name: 'Parar' })).toBeVisible();
  await a.waitForTimeout(700);
  await shot(a, '14-partida-escritorio', false);
  await shot(b, '15-partida-movil');

  // Pausa por votación: propone una, vota la otra y se reanuda cuando las dos pulsan «Listo».
  await a.getByRole('button', { name: 'Proponer pausa' }).click();
  await expect(b.locator('.vote-box').getByText(/propone una pausa/)).toBeVisible();
  await b.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(a.getByRole('heading', { name: 'Partida en pausa' })).toBeVisible();
  await expect(b.getByRole('heading', { name: 'Partida en pausa' })).toBeVisible();
  await a.waitForTimeout(400);
  await shot(a, '16-pausa');
  await a.getByRole('button', { name: 'Listo para seguir' }).click();
  await b.getByRole('button', { name: 'Listo para seguir' }).click();
  await expect(a.getByText(/Se reanuda en/)).toBeVisible();
  await expect(a.getByRole('heading', { name: 'Partida en pausa' })).toBeHidden({ timeout: 8000 });

  // Recargar a mitad de partida devuelve a la arena con la instantánea completa.
  await b.reload();
  await expect(b.locator('.map-canvas')).toBeVisible();
  await expect(b.getByText('Toca una casilla para ir.', { exact: false })).toBeVisible();

  // Abandonar deja a la amiga fuera, mirando, con su puesto en la lista.
  await b.getByRole('button', { name: 'Abandonar la partida' }).click();
  await b.getByRole('button', { name: /Quedarás fuera/ }).click();
  await expect(b.getByText('Estás fuera de la arena, pero puedes seguir mirando.')).toBeVisible();
  await expect(a.getByText(/Ha abandonado · puesto 4/)).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});
