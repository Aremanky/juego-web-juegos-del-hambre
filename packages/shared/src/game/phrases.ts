import type { PersonalityKey } from './bots.js';

/**
 * Frases de los bots (GDD §13, «Diálogo»). Son datos: plantillas por situación y por voz, con un
 * identificador estable `situacion.voz.n` para poder traducirlas sin tocar el código.
 *
 * Reglas del catálogo (las comprueba `phrases.test.ts`):
 * - Cortas: hasta `MAX_PHRASE_CHARS` caracteres antes de poner el nombre.
 * - Un único marcador, `{objetivo}` (el nombre del otro), y solo en las situaciones de `TARGETED`.
 * - Nada que el bot no haya percibido: ni nombres de región ni sitios ni datos de nadie.
 * - Sin género gramatical del que habla ni del objetivo (un bot puede ser hombre o mujer).
 * - Sin emojis. Con el vocabulario de la Ciudadela, con mesura.
 */
export const SPEECH_SITUATIONS = [
  'estallido',
  'acecho',
  'huida',
  'anochecer',
  'amanecer',
  'caida',
  'region',
  'victoria',
  'propuesta',
  'acepta',
  'rechaza',
  'traicion',
  'suplica',
] as const;
export type SpeechSituation = (typeof SPEECH_SITUATIONS)[number];

/** Las que ya se disparan en la partida. Las otras cinco llegan con las alianzas y el combate (fase 8). */
export const LIVE_SITUATIONS: readonly SpeechSituation[] = ['estallido', 'acecho', 'huida', 'anochecer', 'amanecer', 'caida', 'region', 'victoria'];

/** Situaciones que se dirigen a alguien: llevan `{objetivo}`. */
export const TARGETED: ReadonlySet<SpeechSituation> = new Set<SpeechSituation>(['acecho', 'huida', 'caida', 'propuesta', 'acepta', 'rechaza', 'traicion', 'suplica']);

export const VOICE_KEYS = ['fiero', 'prudente', 'receloso', 'frio', 'cordial', 'taimado', 'curioso', 'caotico'] as const;
export type VoiceKey = (typeof VOICE_KEYS)[number];

/** Con qué voz habla cada personalidad. */
export const VOICE_OF: Record<PersonalityKey, VoiceKey> = {
  agresivo: 'fiero',
  cauteloso: 'prudente',
  desconfiado: 'receloso',
  estratega: 'frio',
  pacifico: 'cordial',
  cooperativo: 'cordial',
  manipulador: 'taimado',
  traicionero: 'taimado',
  explorador: 'curioso',
  impredecible: 'caotico',
};

export const MAX_PHRASE_CHARS = 64;

export const PHRASES: Record<SpeechSituation, Record<VoiceKey, readonly string[]>> = {
  estallido: {
    fiero: ['El Obelisco es mío. Apartaos.', 'Nadie me quita el primer botín.', 'Que se aparte quien quiera vivir.'],
    prudente: ['Mejor lejos del Obelisco. Mucho mejor.', 'Respira. Corre. No mires atrás.', 'Que se peleen ellos por las cajas.'],
    receloso: ['Al primero que se me acerque, lo aparto.', 'No me fío de ninguno de vosotros.', 'Cada uno a lo suyo. Y lejos de mí.'],
    frio: ['Primero el terreno. Luego el botín.', 'Unos segundos de caos. Hay que usarlos.', 'El Obelisco es una trampa para impacientes.'],
    cordial: ['Suerte a todos. De verdad.', 'No tenemos por qué matarnos al empezar.', 'Que salga alguien con vida de aquí. Ojalá varios.'],
    taimado: ['Id vosotros delante. Yo os cubro.', 'Qué valientes todos. Ya veremos luego.', 'Que la Audiencia disfrute. Yo pienso hacerlo.'],
    curioso: ['Por fin. A ver qué esconde esta arena.', 'Me voy a ver mundo. Que os vaya bien.', 'Los Arquitectos se han lucido con el mapa.'],
    caotico: ['¿Hacia dónde era el Obelisco? Da igual.', 'Hoy me siento con suerte. O con hambre.', 'Voy a correr en círculos, por variar.'],
  },
  acecho: {
    fiero: ['{objetivo}, te tengo.', 'Corre si quieres, {objetivo}. Te alcanzo.', 'Hoy cae {objetivo}. La Audiencia lo verá.'],
    prudente: ['Calma, {objetivo}. Solo miro.', '{objetivo} no mira hacia aquí. Esta vez sí.', 'Despacio, que {objetivo} no se entere.'],
    receloso: ['Te he visto, {objetivo}. No des un paso más.', 'Sé lo que tramas, {objetivo}.', '{objetivo}, aquí no hay sitio para dos.'],
    frio: ['{objetivo} está en desventaja. Lo sabe.', 'Las cuentas salen, {objetivo}. Lo siento.', 'Paciencia. {objetivo} cometerá un error.'],
    cordial: ['No es nada personal, {objetivo}.', '{objetivo}, ríndete y lo dejamos aquí.', 'Perdona, {objetivo}. Son las reglas.'],
    taimado: ['{objetivo}, ven, que no muerdo.', 'Qué casualidad verte por aquí, {objetivo}.', 'Calma, {objetivo}. Nos llevamos bien, ¿no?'],
    curioso: ['¿A dónde vas tan deprisa, {objetivo}?', 'Te sigo el rastro desde hace rato, {objetivo}.', '{objetivo}, enséñame qué llevas.'],
    caotico: ['¡{objetivo}! ¡Qué alegría verte! Y pillarte.', '{objetivo}, juguemos al pilla-pilla.', 'Hoy toca {objetivo}. Mañana, quién sabe.'],
  },
  huida: {
    fiero: ['Esto no ha acabado, {objetivo}.', 'Me retiro, {objetivo}. Pero volveré.', 'Disfruta mientras puedas, {objetivo}.'],
    prudente: ['¡No, no, no! Déjame, {objetivo}.', '{objetivo}, no busco pelea. Me voy.', 'Aire. Necesito aire y distancia.'],
    receloso: ['Sabía que vendrías, {objetivo}.', 'Ni un paso más, {objetivo}. Me largo.', 'Os veo venir a todos. A ti también, {objetivo}.'],
    frio: ['Retirada. Ya habrá otra ocasión, {objetivo}.', '{objetivo} tiene ventaja. Por ahora.', 'No es el momento. Cambio de planes.'],
    cordial: ['¡{objetivo}, por favor! No tiene por qué ser así.', 'Me voy, {objetivo}. Déjalo estar.', 'No quiero hacerte daño, {objetivo}. Ni que me lo hagas.'],
    taimado: ['¡{objetivo}, mira detrás de ti!', 'Otro día, {objetivo}. Te debo una.', 'Corre tú también, {objetivo}. Algo viene.'],
    curioso: ['Vale, vale, {objetivo}. Ya me iba.', 'Ese camino era mejor de todas formas.', 'Nota mental: no cruzarse con {objetivo}.'],
    caotico: ['¡Adiós, {objetivo}! ¡Ha sido un placer!', 'Retirada estratégica. O cobarde. Lo que sea.', '{objetivo}, ¿me prestas tus piernas? Las mías no corren.'],
  },
  anochecer: {
    fiero: ['Que caiga la noche. Yo no duermo.', 'La oscuridad es para los que cazan.', 'Esta noche alguien no verá el amanecer.'],
    prudente: ['Noche. Toca esconderse y no hacer ruido.', 'Cualquier sombra puede ser alguien.', 'Ojalá esta noche pase rápido.'],
    receloso: ['De noche se acercan los traidores.', 'Ni una hoguera. Ni un ruido.', 'Esta noche duermo con un ojo abierto.'],
    frio: ['Menos visión para todos. Hay que aprovecharlo.', 'La noche premia al que sabe esperar.', 'Cambia el tablero. Cambia el plan.'],
    cordial: ['Buenas noches, arena. Que nadie caiga hoy.', 'Se ve el Obelisco brillar. Qué raro es todo.', 'Aguantad todos. Ya queda menos.'],
    taimado: ['La noche guarda bien los secretos.', 'Qué buena hora para hacer amigos.', 'A oscuras todos parecemos de fiar.'],
    curioso: ['De noche la arena suena distinto.', 'Las estrellas de la Cúpula son falsas, ¿no?', 'Me pregunto qué sale de noche por aquí.'],
    caotico: ['¡La noche! Mi momento favorito. Creo.', 'Le voy a cantar a la luna de la Cúpula.', 'Si alguien tiene miedo, que no soy yo.'],
  },
  amanecer: {
    fiero: ['Otro día. Otra caza.', 'Sigo en pie. Que tomen nota.', 'Amanece y sigo aquí. Malas noticias.'],
    prudente: ['He sobrevivido a la noche. Bien.', 'Luz al fin. Ahora a moverse con cuidado.', 'Un día más. Solo uno más.'],
    receloso: ['Con luz se ve mejor quién miente.', 'Que nadie se me acerque mientras desayuno.', 'Sigo aquí. Nadie me ha vendido. Aún.'],
    frio: ['Nuevo día. Repaso lo que sé.', 'Con luz, toca cambiar de posición.', 'Siguiente fase. Quedan menos.'],
    cordial: ['Buenos días a quien siga en pie.', 'Qué alivio ver el sol, aunque sea falso.', 'Amanece. Seguimos aquí, de algún modo.'],
    taimado: ['Buenos días, queridos rivales.', 'Hoy alguien va a cometer un error.', 'Qué día tan bonito para un pacto.'],
    curioso: ['¡Luz! A ver qué hay detrás de esa loma.', 'Hoy toca explorar el otro lado.', 'Con el sol, todo parece otro sitio.'],
    caotico: ['¿Ya es de día? ¿Cuándo ha pasado eso?', 'Buenos días, Ciudadela. Os veo.', 'Hoy voy a hacer algo inesperado. Ya veréis.'],
  },
  caida: {
    fiero: ['Uno menos. Adiós, {objetivo}.', '{objetivo} fuera. El siguiente, cualquiera.', 'Se acabó para {objetivo}. Bien.'],
    prudente: ['{objetivo} ya no está. Podía haber sido yo.', 'Uno menos. Y sin moverme de aquí.', 'Lo siento, {objetivo}. De verdad.'],
    receloso: ['Uno menos del que fiarse. Adiós, {objetivo}.', '{objetivo} fuera. ¿Quién ha sido?', 'Lo sabía. {objetivo} no iba a durar.'],
    frio: ['{objetivo} fuera. Ajusto las cuentas.', 'Una variable menos: {objetivo}.', 'Era cuestión de tiempo, {objetivo}.'],
    cordial: ['Descansa, {objetivo}. Lo hiciste bien.', 'Ojalá {objetivo} esté a salvo fuera.', 'Otra silla vacía. Adiós, {objetivo}.'],
    taimado: ['Pobre {objetivo}. Ya decía yo.', '{objetivo} se va. Más para nosotros.', 'Qué pena lo de {objetivo}. Qué pena.'],
    curioso: ['¿{objetivo}? ¿Así, sin más? Vaya.', 'Me habría gustado saber qué vio {objetivo}.', 'Adiós, {objetivo}. Una historia menos.'],
    caotico: ['¡{objetivo} fuera! ¿Un minuto de silencio? No.', 'Adiós, {objetivo}. Te echaré de menos un rato.', '{objetivo} se ha ido. Me quedo con su sitio.'],
  },
  region: {
    fiero: ['Este sitio ahora es mío.', 'Que salga quien se esconda aquí.', 'Territorio nuevo. Nadie a la vista.'],
    prudente: ['Aquí no hay nadie. Creo.', 'Buen sitio para pasar desapercibido.', 'Despacio. Lugar nuevo, peligros nuevos.'],
    receloso: ['Demasiado tranquilo. No me gusta.', 'Aquí podría haber una trampa.', 'Si alguien me sigue, se va a enterar.'],
    frio: ['Terreno nuevo. Lo anoto.', 'Buenas rutas de escape aquí.', 'Este lugar puede servir más adelante.'],
    cordial: ['Qué sitio tan bonito para ser una arena.', 'Aquí se podría descansar un rato.', 'Si alguien llega, que venga en paz.'],
    taimado: ['Un rincón discreto. Me gusta.', 'Aquí se podrían cerrar buenos tratos.', 'Nadie sabrá que he pasado por aquí.'],
    curioso: ['¡Mira esto! Los Arquitectos se han esmerado.', 'Nuevo rincón del mapa. Me encanta.', '¿Quién habrá construido esto antes?'],
    caotico: ['Huele a ceniza. Como todo, vaya.', 'Declaro este lugar mío. O no.', 'Aquí estuve yo. Que conste.'],
  },
  victoria: {
    fiero: ['Os lo dije. Al final, en pie, quedo yo.', 'Que la Ciudadela recuerde mi nombre.', 'Nadie podía conmigo. Nadie.'],
    prudente: ['¿Ya está? ¿He ganado? No me lo creo.', 'Sobrevivir era todo lo que quería.', 'Paciencia. Siempre fue cuestión de paciencia.'],
    receloso: ['Sin confiar en nadie. Así se gana.', 'Sin nadie al lado. Como siempre.', 'Nadie me la jugó. Ni uno.'],
    frio: ['Todo según lo previsto.', 'Las cuentas salieron. Fin.', 'Victoria. Era la conclusión lógica.'],
    cordial: ['Gracias a todos. Ojalá no hubiera hecho falta.', 'Gano yo, pero esto no lo gana nadie.', 'Por todos los que se quedaron en el camino.'],
    taimado: ['Gracias por confiar en mí. Error vuestro.', 'Todo fue un placer. Sobre todo para mí.', 'Ganar con una sonrisa. Esa es la clave.'],
    curioso: ['Gané, y aún me quedan rincones por ver.', 'Qué arena. Me la conozco entera.', 'Y yo que vine a dar un paseo.'],
    caotico: ['¿He ganado? ¡He ganado! ¿Cómo?', 'Ni yo sabía que iba a pasar esto.', '¡Para la Audiencia! Y para mí, sobre todo.'],
  },
  // ---- Fase 8: alianzas, traiciones y combate. Escritas, sin disparar todavía.
  propuesta: {
    fiero: ['{objetivo}, conmigo o contra mí. Elige.', 'Contigo barro esta arena, {objetivo}. Luego ya veremos.'],
    prudente: ['{objetivo}, ¿nos cubrimos las espaldas?', 'Por separado no duramos, {objetivo}. Con ayuda, quizá.'],
    receloso: ['Te propongo algo, {objetivo}. No me falles.', 'Alianza, {objetivo}. A la primera, se acabó.'],
    frio: ['{objetivo}, nos conviene a los dos.', 'Una alianza temporal, {objetivo}. Beneficio mutuo.'],
    cordial: ['{objetivo}, ¿hacemos equipo? Será más fácil.', '¿Nos cuidamos mutuamente, {objetivo}?'],
    taimado: ['{objetivo}, tú y yo podríamos llegar lejos.', 'Confía en mí, {objetivo}. Nunca te fallaría.'],
    curioso: ['{objetivo}, ¿exploramos en equipo?', 'Dos ven más que uno, {objetivo}.'],
    caotico: ['{objetivo}, hagamos las paces. Durante un rato.', 'Alianza, {objetivo}. Tengo un plan. Más o menos.'],
  },
  acepta: {
    fiero: ['Hecho, {objetivo}. No me estorbes.', 'Vale, {objetivo}. Tú cubres, yo golpeo.'],
    prudente: ['Sí, {objetivo}. Gracias. De verdad.', 'De acuerdo, {objetivo}. Con cuidado.'],
    receloso: ['Acepto, {objetivo}. Pero te vigilo.', 'Bien, {objetivo}. Una traición y se acabó.'],
    frio: ['Aceptado, {objetivo}. Repasemos el plan.', 'Trato hecho, {objetivo}. Por ahora.'],
    cordial: ['¡Claro que sí, {objetivo}! En equipo.', 'Me alegra, {objetivo}. Cuidémonos.'],
    taimado: ['Un placer, {objetivo}. Sabía que lo verías claro.', 'Por supuesto, {objetivo}. Lo que tú digas.'],
    curioso: ['¡Hecho, {objetivo}! Tengo sitios que enseñarte.', 'Vale, {objetivo}. Me fío de tu olfato.'],
    caotico: ['¡Sí, {objetivo}! ¿A qué hemos dicho que sí?', 'Trato, {objetivo}. Me encantan los tratos.'],
  },
  rechaza: {
    fiero: ['¿Contigo, {objetivo}? Ni hablar.', 'No necesito a nadie, {objetivo}.'],
    prudente: ['Lo siento, {objetivo}. Prefiero ir por mi cuenta.', 'No, {objetivo}. Aún no me fío.'],
    receloso: ['No, {objetivo}. Ni ahora ni nunca.', '¿Alianza? Buen intento, {objetivo}.'],
    frio: ['No me conviene, {objetivo}.', 'Los números no salen, {objetivo}.'],
    cordial: ['Ahora no, {objetivo}. Pero sin rencor.', 'Gracias, {objetivo}, pero voy por mi cuenta.'],
    taimado: ['Qué detalle, {objetivo}. Pero no.', 'Me lo pienso, {objetivo}. Que es un no.'],
    curioso: ['Voy a mi aire, {objetivo}. Lo siento.', 'Quizá luego, {objetivo}. Tengo prisa.'],
    caotico: ['No, {objetivo}. Bueno, sí. No. No.', 'Hoy no, {objetivo}. Me lo ha dicho una piedra.'],
  },
  traicion: {
    fiero: ['Nada personal, {objetivo}. Bueno, un poco.', 'Se acabó la alianza, {objetivo}.'],
    prudente: ['Perdona, {objetivo}. Era tú o yo.', 'Lo siento, {objetivo}. No había otra salida.'],
    receloso: ['Antes de que me la juegues tú, {objetivo}.', 'Nunca me fie de ti, {objetivo}.'],
    frio: ['Era el momento óptimo, {objetivo}.', 'La alianza ya no me servía, {objetivo}.'],
    cordial: ['No quería, {objetivo}. Perdóname.', 'Esto me duele más a mí, {objetivo}.'],
    taimado: ['¿De verdad confiabas en mí, {objetivo}?', 'Gracias por todo, {objetivo}. Sobre todo por fiarte.'],
    curioso: ['Quería ver qué pasaba, {objetivo}. Ya lo sé.', 'Cambio de rumbo, {objetivo}. Sin ti.'],
    caotico: ['¡Sorpresa, {objetivo}!', 'Ups, {objetivo}. No sé por qué he hecho eso.'],
  },
  suplica: {
    fiero: ['Remátame si puedes, {objetivo}.', 'Aún me queda un golpe, {objetivo}.'],
    prudente: ['Por favor, {objetivo}. Déjame ir.', 'No lo hagas, {objetivo}. Te lo suplico.'],
    receloso: ['Hazlo ya, {objetivo}. Sabía que lo harías.', 'No te pido nada, {objetivo}. Nunca lo hice.'],
    frio: ['Me necesitas con vida, {objetivo}. Piénsalo.', 'Una tregua, {objetivo}. Te conviene.'],
    cordial: ['{objetivo}, por favor. Podemos parar.', 'Ya basta, {objetivo}. Ya basta.'],
    taimado: ['{objetivo}, podemos llegar a un acuerdo.', 'Espera, {objetivo}. Sé algo que te interesa.'],
    curioso: ['Espera, {objetivo}. Aún tengo mucho por ver.', '{objetivo}, déjame ver un amanecer más.'],
    caotico: ['¿Y si lo dejamos en empate, {objetivo}?', '¡{objetivo}! ¡Mira, un pájaro! ¿No?'],
  },
};

/**
 * Elige una frase de la voz de esa personalidad. `roll` en [0, 1) marca el índice; se salta lo dicho
 * hace poco (`recent`) si queda otra, y si no, repite antes que callarse.
 */
export function pickPhrase(situation: SpeechSituation, personality: PersonalityKey, roll: number, recent: readonly string[] = []): { id: string; template: string } {
  const voice = VOICE_OF[personality];
  const list = PHRASES[situation][voice];
  const start = Math.min(list.length - 1, Math.floor(Math.max(0, roll) * list.length));
  for (let k = 0; k < list.length; k++) {
    const i = (start + k) % list.length;
    const id = `${situation}.${voice}.${i}`;
    if (!recent.includes(id)) return { id, template: list[i] };
  }
  return { id: `${situation}.${voice}.${start}`, template: list[start] };
}

/** Pone el nombre del otro en la plantilla («alguien» si no se sabe). */
export function fillPhrase(template: string, vars: { objetivo?: string }): string {
  return template.replace('{objetivo}', vars.objetivo ?? 'alguien');
}
