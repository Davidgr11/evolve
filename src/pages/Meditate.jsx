import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../utils/firebase';
import { doc, getDoc, setDoc, arrayUnion } from 'firebase/firestore';
import {
  ChevronLeft, Loader2, Play, Square,
  CloudRain, Waves, TreePine, Flame, Sparkles, VolumeX, Wind, Droplets,
} from 'lucide-react';
import { callClaude, ttsSpeak } from '../utils/cloudApi';
import toast from '../utils/toast';

// ── Helpers ────────────────────────────────────────────────────────────────────

const toLocalDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const SOUNDS = [
  { id: 'rain',   label: 'Lluvia',  Icon: CloudRain, from: '#5a7fa0', to: '#8ab0c8' },
  { id: 'ocean',  label: 'Océano',  Icon: Waves,     from: '#1a6080', to: '#3a9aba' },
  { id: 'forest', label: 'Bosque',  Icon: TreePine,  from: '#2a6040', to: '#4a9a68' },
  { id: 'river',  label: 'Río',     Icon: Droplets,  from: '#2e7090', to: '#5aa8c8' },
  { id: 'wind',   label: 'Viento',  Icon: Wind,      from: '#607890', to: '#90aac0' },
  { id: 'fire',   label: 'Fogata',  Icon: Flame,     from: '#a03010', to: '#d86030' },
  { id: 'space',  label: 'Espacio', Icon: Sparkles,  from: '#1a1060', to: '#3a2890' },
  { id: 'none',   label: 'Silencio',Icon: VolumeX,   from: '#4a5060', to: '#7a8090' },
];

const DURATIONS = [
  { mins: 3,  label: '3 min',  secs: 180 },
  { mins: 5,  label: '5 min',  secs: 300 },
  { mins: 10, label: '10 min', secs: 600 },
];

const THEME_GROUPS = [
  {
    id: 'trabajo', label: 'Trabajo', emoji: '💼',
    themes: [
      {
        id: 'stress-work', label: 'Estrés laboral',
        phrases: [
          'Bienvenido a este espacio tuyo. Por unos minutos, el trabajo y todas sus demandas pueden esperar con tranquilidad. Lleva tu atención a la respiración y permítete estar completamente aquí.',
          'Siente el peso en tus hombros y permíteles soltarse suavemente hacia abajo. Con cada exhalación, deja ir una fracción de esa tensión muscular. Tu cuerpo sabe liberar lo que ya no necesita cargar.',
          'Tu mente trabajó duro hoy y merece este descanso genuino. Observa los pensamientos que aparecen y déjalos pasar sin aferrarte a ninguno. Este es tu tiempo de recuperación.',
          'Cada exhalación lleva consigo la tensión acumulada en tu cuerpo y tu mente. Imagina que con cada respiración tu sistema nervioso recibe una señal de seguridad. Poco a poco, la calma reemplaza la activación.',
          'Las tareas pendientes seguirán ahí más tarde, exactamente donde las dejaste. Este momento es solo tuyo para recargar y recuperar claridad. Permítete existir aquí sin producir nada.',
          'Eres mucho más que tu productividad — tu valor no depende de cuánto produces en un día. Trae una respiración profunda y deja que esa verdad se instale en tu cuerpo. Eres suficiente más allá de lo que logras.',
          'Imagina que la presión del trabajo se disuelve con cada respiración que haces. Visualiza cómo esa tensión abandona tus hombros, tu mandíbula, tu pecho. El espacio que queda es tuyo para llenarlo de calma.',
          'Tu cuerpo sabe cómo recuperarse — solo necesita el permiso de hacerlo ahora mismo. Date ese permiso sin condiciones ni culpa. Esta pausa no es debilidad, es inteligencia y cuidado propio.',
          'Los problemas del trabajo tienen solución, y tu paz interior también la tiene. Desde un estado calmado, las respuestas llegan con más claridad y menos esfuerzo. Respira y confía en ese proceso.',
          'Observa los pensamientos de trabajo como nubes que pasan sin detenerse en el cielo. No tienes que seguirlos ni resolverlos en este momento. Tu única tarea aquí es respirar y soltar.',
          'Con cada respiración profunda, tu claridad mental se restaura y tu perspectiva se amplía. El descanso no paraliza tu efectividad — la potencia y la multiplica. Estás invirtiendo en tu mejor versión.',
          'Al terminar esta sesión regresarás al trabajo renovado, con mayor enfoque y perspectiva fresca. Confía en que esta pausa tiene un propósito real. Lo que esperas al salir, vale la pena que espere unos minutos.',
        ],
      },
      {
        id: 'focus-work', label: 'Enfoque y productividad',
        phrases: [
          'Centra tu atención en este momento presente. Todo lo demás — pendientes, notificaciones, ruidos — puede esperar unos minutos. Este es tu tiempo para preparar la mente.',
          'Siente cómo tu mente se aquieta y se vuelve más clara con cada respiración. Como agua que deja de agitarse, tu claridad emerge sola cuando se le da espacio. Obsérvala aparecer.',
          'Visualiza tu tarea más importante con todos sus detalles y su resultado final. La ves completada con éxito, exactamente como quieres que quede. Siente la satisfacción de ese logro en tu cuerpo ahora mismo.',
          'Tu mejor trabajo surge siempre de un estado mental calmado y enfocado, nunca de la tensión. La presión no produce calidad — la calma, sí. Esta pausa es parte activa de tu rendimiento.',
          'Libera los pensamientos que dispersan tu energía en este momento. Con cada exhalación, regresa suavemente a tu centro. Tu enfoque se afila cuando dejas de forzarlo.',
          'La claridad que necesitas ya está en ti, solo requiere espacio para emerger completamente. No tienes que generarla — solo tienes que dejar de bloquearla. Respira y permite que aparezca.',
          'Con cada exhalación sueltas la distracción acumulada. Con cada inhalación recibes enfoque renovado y limpio. Este ciclo es tu herramienta más poderosa antes de trabajar en profundidad.',
          'Tu mente es un instrumento preciso y esta pausa la afila para lo que sigue. Como un músico que afina antes de tocar, tú afinas tu atención antes de crear. La calidad de tu trabajo empieza aquí.',
          'Visualiza el flujo de trabajo que deseas tener hoy: tranquilo, efectivo y con momentum natural. Siente cómo tu energía se organiza hacia ese estado. Estás creando las condiciones internas para lograrlo.',
          'La concentración profunda llega cuando la mente está en reposo, no cuando está en tensión forzada. No puedes exigir el enfoque — puedes crear las condiciones para que llegue solo. Eso es exactamente lo que haces ahora.',
          'Cuando termines esta sesión, llevarás esta calma a todo lo que hagas durante el resto del día. Cada tarea, cada decisión será mejor desde este estado interior. Esta inversión de tiempo ya está generando retorno.',
          'Estás listo para dar lo mejor de ti hoy. Tu mente y tu cuerpo están alineados, preparados y en calma. Cuando salgas de aquí, actúa desde esa certeza sin dudar.',
        ],
      },
      {
        id: 'event-work', label: 'Presentación o reunión',
        phrases: [
          'Toma este momento para centrarte profundamente antes de lo que viene. Siente tus pies en el suelo y tu respiración como ancla firme. Todo lo que necesitas para este momento ya lo tienes dentro.',
          'Los nervios que sientes son energía que puedes dirigir completamente a tu favor. Son señal de que te importa lo que haces, de que das lo mejor de ti. Respira y transforma esa energía en presencia plena.',
          'Has preparado esto con cuidado y dedicación real. Confía en lo que sabes, en lo que has practicado y en lo que eres como persona. Tu preparación ya está hecha — ahora solo tienes que ser tú.',
          'Visualízate en la reunión: tranquilo, claro, presente y conectado con las personas que escuchan. Imagina tu voz segura y tus ideas bien articuladas. Esa imagen ya está sembrando el estado que quieres tener.',
          'Tu voz es segura y tus ideas tienen valor real y concreto. Mereces ser escuchado con atención y respeto genuino. Respira hacia esa convicción y déjala instalarse en tu cuerpo antes de entrar.',
          'Con cada respiración profunda, tu sistema nervioso recibe la señal de que estás a salvo y preparado. El cortisol disminuye, tu voz se estabiliza, tu mente se aclara. Estás recuperando tu mejor estado natural.',
          'Piensa en otras veces que saliste adelante en situaciones desafiantes o incómodas. Esa capacidad no te ha abandonado — sigue exactamente donde siempre estuvo. Llevas ese historial completo contigo a esta presentación.',
          'No necesitas ser perfecto para tener impacto real — solo necesitas ser auténtico y preparado. La gente conecta con la autenticidad mucho más que con cualquier perfección forzada. Sé tú mismo y confía plenamente en eso.',
          'El éxito no requiere la ausencia de nervios — requiere saber respirar a través de ellos con calma y confianza. Los mejores comunicadores sienten nervios y los usan como combustible. Tú estás haciendo exactamente eso ahora.',
          'Imagina que todo sale bien: fluido, natural, con buena conexión y mensajes claros. Siente esa satisfacción genuina instalarse en tu cuerpo como una sensación real y presente. Esa imagen es más poderosa de lo que imaginas.',
          'Estás más listo de lo que crees en este momento. Tu preparación, tu experiencia y tu intención clara te respaldan completamente. Confía en el proceso y en ti mismo sin reservas.',
          'Cuando abras los ojos llevarás esta calma y esta seguridad contigo a cada momento de la reunión. Regresarás a este estado con una sola respiración consciente si la necesitas. Ya sabes cómo hacerlo.',
        ],
      },
    ],
  },
  {
    id: 'vida-social', label: 'Vida social', emoji: '👥',
    themes: [
      {
        id: 'conflict', label: 'Conflicto con alguien',
        phrases: [
          'Este es tu espacio seguro para procesar lo que sientes, completamente sin juicio. Aquí puedes sentir todo lo que necesitas sentir sin tener que actuar. Date este permiso ahora.',
          'Es completamente válido sentirse afectado por un conflicto — eso te hace profundamente humano. No tienes que minimizar lo que sientes para pasar la página más rápido. Respira y deja que las emociones existan.',
          'Inhala profundo y dale espacio real a las emociones para asentarse con calma. Como el sedimento en agua agitada, se aclaran solas cuando dejas de moverlas. Tu claridad está llegando.',
          'Detrás de cada conflicto hay necesidades no expresadas que merecen ser escuchadas. Las tuyas importan tanto como las de la otra persona. Identifica con calma qué es lo que realmente necesitas tú.',
          'No tienes que resolver todo ahora ni tener respuestas inmediatas. Solo tienes que estar bien tú primero, antes de cualquier otra cosa. Eso no es egoísmo — es sabiduría.',
          'Lleva tu atención a tu cuerpo. ¿Dónde guardas la tensión de este conflicto — el pecho, la mandíbula, el estómago? Respira suavemente hacia ese lugar con cada inhalación y libéralo con cada exhalación.',
          'La comprensión verdadera llega cuando la mente está calmada, no cuando está reactiva y defensiva. Desde este estado de calma, verás opciones que antes no eran visibles. Espera ese momento.',
          'Puedes sentirte herido y también elegir conscientemente cómo quieres responder. Esa elección es tu poder más grande en cualquier conflicto. Respira y decide desde ahí, no desde el dolor.',
          'Deja ir por ahora la necesidad urgente de tener razón o de resolver. Busca tu paz interior primero y la claridad llegará después naturalmente. El conflicto no desaparece, pero tú lo afrontas diferente.',
          'Con cada respiración, creas distancia sana entre el evento y tu reacción emocional. Esa distancia no es frialdad — es sabiduría y autocontrol real. Desde ahí puedes actuar con más integridad.',
          'Las relaciones genuinas sobreviven los conflictos cuando hay voluntad y claridad de ambas partes. Este momento de pausa es ya un acto de cuidado hacia la relación. Estás eligiendo bien.',
          'Al salir de aquí tendrás mayor claridad, calma y perspectiva para afrontar esta situación. Llevarás contigo no solo calma, sino también una comprensión más amplia. Ese es el regalo de esta pausa.',
        ],
      },
      {
        id: 'social-anxiety', label: 'Ansiedad social',
        phrases: [
          'Este espacio es completamente tuyo. Aquí no hay nada que demostrar, nadie que te juzgue ni expectativa que cumplir. Solo tú y tu respiración.',
          'La ansiedad social es una respuesta automática del cuerpo ante una amenaza percibida, no una verdad sobre quién eres. Tu cuerpo trata de protegerte con exceso de celo. Puedes agradecerle y relajarlo.',
          'Respira lento y profundo. Tu sistema nervioso está recibiendo la señal de que estás a salvo ahora mismo. Cada respiración tranquila le enseña a tu cuerpo que puede relajarse.',
          'No tienes que caerle bien a todos ni ser aprobado por cada persona que conoces. Solo tienes que ser tú mismo con honestidad y los vínculos correctos llegarán. Eso es suficiente.',
          'Los demás están mucho más enfocados en sus propios pensamientos de lo que imaginas. La atención que sientes sobre ti existe principalmente en tu mente. Respira y suelta esa carga imaginaria.',
          'Con cada respiración, reduces la señal de alarma en tu sistema nervioso central. El cortisol baja, los músculos se relajan, la mente se calma. Estás entrenando a tu cuerpo hacia la calma.',
          'Piensa en alguien con quien te sientes completamente cómodo y aceptado tal como eres. Siente esa calidez en tu cuerpo por un momento. Esa misma paz está disponible en muchos más contextos de los que crees.',
          'Tienes perspectivas, ideas y algo valioso que ofrecer al mundo que te rodea. Tu presencia auténtica importa de verdad. No tienes que ser perfecto para merecer espacio y ser escuchado.',
          'La incomodidad social que sientes es una sensación temporal y pasajera, no una condena. Esta sesión te está ayudando a atravesarla con más recursos. Cada vez que lo haces, te vuelves más capaz.',
          'Tus palabras tienen valor real. Tu perspectiva única merece ser compartida sin disculpas. Practica creerlo aquí en la seguridad de este espacio antes de llevarlo al mundo.',
          'Con práctica constante y paciencia genuina contigo mismo, la ansiedad social cede terreno poco a poco. No tienes que resolverlo todo hoy. Cada respiración consciente es ya un paso significativo.',
          'Al terminar, llevarás una presencia más calmada, más enraizada y más segura al mundo. Notarás pequeñas diferencias. Confía en el proceso y en tu propio avance.',
        ],
      },
      {
        id: 'loneliness', label: 'Soledad',
        phrases: [
          'Estar solo no significa estar abandonado o no ser querido. Eres compañía valiosa para ti mismo. Aprende a habitar ese espacio con gentileza.',
          'Respira profundo y siente tu propio corazón latiendo con fuerza. Hay vida, calor y presencia genuina en ti. Nunca estás completamente solo mientras estés contigo.',
          'La soledad que sientes a veces es solo el espacio natural entre conexiones humanas. Es temporal y conocida por todos. Pasará, como siempre ha pasado.',
          'Date la misma gentileza, paciencia y afecto que le darías sin dudar a un amigo que se siente solo. Eres tan merecedor de esa compasión como cualquier otra persona. Empieza por ti.',
          'Piensa en alguien específico que te aprecia y te quiere, aunque esté lejos en este momento. Siente ese afecto real como una calidez en tu pecho. Ese amor existe aunque no lo veas en este instante.',
          'La conexión genuina puede traspasar la distancia física y el tiempo. Hay personas que piensan en ti aunque no te lo digan en este momento. Eso también es real y presente.',
          'Utiliza esta quietud como un regalo valioso que pocos se permiten. Hay algo en ti que solo florece en el silencio y en la soledad. Descúbrelo con curiosidad y sin miedo.',
          'La soledad puede ser una invitación profunda a conocerte más genuinamente. ¿Qué descubres cuando el ruido externo cede? Escucha lo que emerge en este espacio interior.',
          'Recuerda momentos específicos de conexión genuina que has vivido con personas que te importan. Esos momentos te formaron y te siguen habitando. Llevas esa riqueza contigo siempre.',
          'Tu presencia en el mundo hace una diferencia real, aunque no siempre la percibas ni la veas reflejada. Las personas que te conocen son mejores por haberte encontrado. Eso es verdad.',
          'Cada vez que te cuidas a ti mismo con amor y atención, construyes la mejor compañía posible. Te conviertes en alguien que disfruta su propia presencia. Eso cambia todo.',
          'Mereces conexión profunda y la encontrarás cuando el momento sea el correcto. Por ahora, esta calma interior también es un hogar válido y real. Habítalo con paz.',
        ],
      },
    ],
  },
  {
    id: 'pareja-familia', label: 'Pareja y familia', emoji: '❤️',
    themes: [
      {
        id: 'couple-conflict', label: 'Discusión de pareja',
        phrases: [
          'Tómate este espacio necesario para ti antes de continuar la conversación. No es huir — es prepararte para hablar mejor. Esta pausa es ya un acto de cuidado hacia la relación.',
          'Lo que sientes tiene validez total y merece ser reconocido. Y lo que siente la otra persona también tiene su propia validez. Pueden coexistir dos verdades sin que ninguna anule a la otra.',
          'Respira profundo y deja que la reactividad se disuelva suavemente antes de responder. Las palabras dichas en calma son siempre más efectivas y menos dañinas. Espera ese momento.',
          'Un conflicto no define la relación ni su futuro. Define cómo deciden atravesarlo juntos y qué aprenden. Este es uno de esos momentos de definición.',
          '¿Qué necesitas tú realmente de esta situación — más allá de ganar o tener razón? Pregúntate con honestidad y sin juzgarte. Esa claridad es el punto de partida para una conversación real.',
          'Con cada respiración, creas espacio valioso entre el dolor que sientes y tu respuesta. Ese espacio es donde viven tus mejores decisiones. Protégelo y expándelo con cada inhalación.',
          'Las palabras y acciones que vienen de la calma tienen mucho más poder transformador que las que vienen de la rabia. Esto no es rendirse — es elegir ser más efectivo. Respira hacia esa convicción.',
          'Piensa en lo que genuinamente valoras de esta persona y de esta relación. Ese amor también es real y presente, aunque ahora esté cubierto por el conflicto. No ha desaparecido.',
          'La vulnerabilidad honesta suele resolver mucho más que ganar cualquier discusión. Decir "me dolió" o "lo necesito" tiene más poder que argumentar quién tiene razón. Eso requiere valentía.',
          'No tienes que tener todo claro ni resuelto ahora mismo. Esta pausa ya es un paso importante hacia adelante. Cuando te sientas más calmado, las palabras correctas llegarán más naturalmente.',
          'Desde este estado calmado y enraizado, puedes escuchar con más apertura y ser escuchado mejor. La comunicación real solo ocurre cuando ambos están presentes y receptivos. Tú estás preparándote para eso.',
          'Al salir de aquí, lleva la intención genuina de entender antes de buscar ser entendido. Esa actitud cambia completamente la dinámica de cualquier conversación difícil. Es un regalo que te das a ti y a la relación.',
        ],
      },
      {
        id: 'family-tension', label: 'Tensión familiar',
        phrases: [
          'Las familias son complejas, contradictorias y también profundamente hermosas. Este momento es para encontrar tu centro antes de volver a ese mundo. Respira y ancla tu identidad.',
          'Respira y separa con claridad lo que puedes controlar de lo que está fuera de tu alcance. Enfoca tu energía solo en lo primero. Soltar lo segundo no es rendición — es sabiduría.',
          'No tienes que resolver toda la dinámica familiar hoy ni llevar el peso de cada problema. Solo tienes que estar bien tú como condición para cualquier cosa más. Eso es suficiente.',
          'La carga familiar es real y puede ser muy pesada en ciertos momentos. Pero no toda te corresponde cargar a ti solo. Aprende a distinguir cuál es tu parte y cuál no lo es.',
          'Cada respiración te devuelve a ti mismo, fuera de los roles y expectativas que juegas en familia. Por un momento, eres solo tú sin ningún título. Siente esa libertad genuina.',
          'Piensa en un momento específico de amor genuino y conexión real con tu familia. Eso también existe y es tan real como la tensión. Los dos conviven en la misma historia.',
          'Puedes amar profundamente a tu familia y también establecer límites saludables y necesarios. No son opuestos — se complementan. Los límites sanos son una forma de amor, no una traición.',
          'El árbol más fuerte tiene raíces profundas que lo sostienen sin limitarlo. Tus raíces familiares te dan contexto y fortaleza, no solo restricciones. Puedes honrarlas y también crecer más allá de ellas.',
          'Con cada exhalación, sueltas conscientemente las expectativas que no son tuyas sino de otros. No tienes que cumplirlas todas para ser suficiente. Elige qué cargar y qué soltar con libertad.',
          'Tu bienestar personal también es un regalo real para tu familia, aunque no siempre lo vean o lo reconozcan. Cuando estás bien, tienes más para dar. Cuidarte es también cuidarlos.',
          'Desde este estado de calma e integridad, tus palabras tendrán más impacto positivo y duradero. Las conversaciones difíciles se resuelven mejor desde aquí. Vale la pena llegar a ese estado.',
          'Llevas amor dentro de ti que es más grande que cualquier tensión que estés viviendo ahora. Ese amor sobrevive los momentos difíciles. Confía en él como base de todo lo que viene.',
        ],
      },
      {
        id: 'disconnection', label: 'Desconexión emocional',
        phrases: [
          'A veces nos perdemos de nosotros mismos en el ruido y las demandas del día a día. No es tu culpa — es la consecuencia de vivir muy rápido y muy hacia afuera. Esta sesión es tu regreso.',
          'Esta sesión es una invitación gentil a reconectar contigo mismo, sin prisa ni expectativas. No necesitas llegar a ningún lugar en particular. Solo estar aquí contigo.',
          'Siente tu respiración moverse suavemente en tu cuerpo. Ese movimiento constante eres tú, vivo y presente. Nunca te has ido del todo — solo te has alejado un poco.',
          '¿Cuándo fue la última vez que te preguntaste cómo estás de verdad, con honestidad y cuidado genuino? No lo que produces o logras — cómo estás tú en este momento. Tómate ese tiempo ahora.',
          'Debajo del cansancio, la distracción y el ruido, hay algo tuyo que espera ser escuchado con paciencia. Ese algo tiene mensajes importantes para ti. Esta quietud es el idioma en que habla.',
          'Con cada inhalación te acercas más a ti mismo. Con cada exhalación sueltas la distancia acumulada. Es un viaje de regreso que puedes hacer siempre que lo elijas.',
          'No necesitas entender ni categorizar todo lo que sientes para validarlo. Solo necesitas sentirlo sin juzgarlo ni rechazarlo. Eso ya es reconexión.',
          'Tu cuerpo guarda una sabiduría profunda que la mente racional no siempre comprende. Esta quietud es el idioma en que esa sabiduría habla. Escúchalo con curiosidad.',
          'La reconexión genuina empieza con este preciso momento, con esta respiración que estás tomando ahora. No hace falta más que esto para comenzar. Estás en camino.',
          'Eres mucho más que tus responsabilidades, roles sociales y obligaciones cotidianas. Hay un ser completo debajo de todo eso. Esta pausa te permite recordarlo.',
          'Date el permiso real de existir aquí sin agenda, sin producir nada, solo siendo. No justifiques este tiempo — simplemente tómalo como tuyo. Lo mereces.',
          'Al terminar llevarás una chispa de reconexión contigo hacia el mundo. Pequeña pero real y valiosa. Esa chispa puede encender más si la cuidas.',
        ],
      },
    ],
  },
  {
    id: 'trafico', label: 'Tráfico y traslados', emoji: '🚗',
    themes: [
      {
        id: 'traffic', label: 'Estrés en el tráfico',
        phrases: [
          'El tráfico está afuera de ti y de tu control. Este espacio interior es completamente tuyo y nadie puede quitártelo. Respira y recuérdalo.',
          'No puedes controlar el tráfico ni cuándo va a moverse. Pero sí puedes elegir cómo respiras y qué sientes en este momento. Esa elección es todo el poder que necesitas.',
          'Suelta conscientemente la mandíbula, los hombros y las manos que aferran el volante. Siente cómo esa tensión cede con solo notarla. Respira hacia esos lugares.',
          'Cada pausa del tráfico es en realidad una invitación a hacer una respiración profunda y consciente. Estás convirtiendo tiempo perdido en tiempo de recuperación. Eso cambia todo.',
          'El destino llegará exactamente cuando tenga que llegar. El camino no tiene que ser un sufrimiento innecesario. Elige cómo quieres vivirlo.',
          'Tu tiempo no se pierde en el tráfico — eso es inevitable. Tu paz, en cambio, solo se pierde si decides entregarla. Recupérala con cada respiración consciente.',
          'Respira profundo y recuerda que esto, como todo en la vida, es completamente temporal. Este momento de tráfico pasará. Lo que construyes en tu interior mientras tanto, permanece.',
          'Cada metro que avanzas es un metro real más cerca de donde vas. Hay progreso, aunque sea lento e irregular. Tu dirección no ha cambiado.',
          'Con cada respiración profunda y lenta, reduces el cortisol en tu sangre y la tensión en tus músculos. Tu cuerpo responde de inmediato a este cuidado. Estás cuidándote mientras esperas.',
          'Piensa en algo concreto y bueno que te espera al llegar — una persona, una comida, tu espacio. Siente ese algo como un imán que te atrae con calma. Ya va a llegar.',
          'Eres más grande y más capaz que este momento de impaciencia e incomodidad. Tu calma es una elección real que puedes hacer ahora mismo. Esa es tu victoria.',
          'Llegarás — eso es inevitable. Y cuando llegues, podrás llegar en paz si eliges respirar ahora en lugar de tensionarte. Esa diferencia la vas a sentir al bajar del auto.',
        ],
      },
      {
        id: 'transition', label: 'Entre actividades',
        phrases: [
          'Has terminado una cosa y vas hacia otra diferente. Este espacio entre ellas es tu momento de transición consciente. Úsalo con intención.',
          'Suelta lo que fue antes de que llegues mentalmente a lo que sigue. No tienes que cargar la energía de una actividad dentro de la siguiente. Puedes elegir llegar limpio.',
          'Tu mente aún carga los residuos de energía de lo anterior — pensamientos, emociones, tensiones. Esta respiración te ayuda a soltarlos completamente. Estás haciendo un reset.',
          'Con cada exhalación dejas ir intencionalmente lo que pasó. Con cada inhalación recibes apertura y frescura para lo que viene. Este es el ciclo de una vida consciente.',
          'No tienes que llegar al siguiente lugar ni a la siguiente persona cargando todo el peso de lo anterior. Puedes elegir comenzar cada cosa de nuevo, desde cero. Esa elección es tuya.',
          'Esta pausa entre actividades no es tiempo perdido. Te hace más efectivo, más presente y más calmado en lo que sigue. Es una inversión que genera retorno inmediato.',
          'Imagina que tu mente es una pizarra. Cada respiración profunda la limpia un poco más. Al terminar esta sesión, estará lista para recibir lo nuevo con claridad.',
          'Llegas a donde llegas con la mejor versión de ti mismo disponible. Esa es la única responsabilidad que tienes en cada transición. Llévate a ti, en calma.',
          'Las mejores transiciones son las que se hacen conscientemente, con intención y presencia. Tienes esa oportunidad ahora mismo. No la dejes pasar.',
          'Tu presencia plena en lo que viene es el mayor regalo que puedes darle a esa siguiente actividad y a las personas que te esperan. Esta pausa lo hace posible.',
          'Suelta lo pasado con gratitud real por lo que fue. Recibe lo presente con apertura genuina. Es la práctica de vivir bien.',
          'Estás listo para lo que viene. Esta pausa fue el puente entre lo que fue y lo que será. Cruzaste bien.',
        ],
      },
      {
        id: 'arriving-home', label: 'Llegada a casa',
        phrases: [
          'Llegaste. El día de afuera con todo lo que trajo puede quedarse afuera esta noche. Aquí empieza otra cosa.',
          'Este espacio es tu hogar y merece tu presencia completa, no solo tu cuerpo exhausto. Permítete entrar en él de verdad, en todos los sentidos.',
          'Siente cómo tu cuerpo reconoce instintivamente la seguridad y el familiar olor de estar en casa. Esa relajación que emerge, dale permiso de expandirse.',
          'Con cada respiración, vas soltando el modo trabajo y sus tensiones. Y vas recuperando el modo vida y sus texturas. Es un cambio que puedes hacer conscientemente.',
          'Las personas que te esperan merecen tu presencia real, no solo tu cuerpo presente en el espacio. Esta pausa es el regalo que les das antes de entrar. Y que te das a ti.',
          'Antes de cruzar la puerta, haz esta transición desde adentro donde realmente importa. Un minuto aquí puede cambiar completamente cómo se vive la noche en casa. Vale el tiempo.',
          'El estrés del día no tiene que entrar contigo ni infectar tu espacio. Puede quedarse simbólicamente en el umbral, afuera. Decide que así sea.',
          'Piensa en algo pequeño y específico que hace tu hogar especial y tuyo. Una persona, un rincón, un olor, una rutina. Sonríe internamente hacia eso.',
          'Con cada exhalación, sueltas el personaje del trabajo y todas sus máscaras. Y recuperas al que eres en casa, en familia. Esa persona también es válida y merece espacio.',
          'Tu familia, tu espacio, tus personas, te esperan. Llégales entero y presente, no a medias. Eso es lo que más necesitan de ti.',
          'El mejor regalo que puedes llevar a casa no es nada material — es tu calma, tu presencia y tu apertura. Eso no se compra. Se cultiva, como lo estás haciendo ahora.',
          'Bienvenido de regreso a ti mismo y a lo que más importa. El hogar verdadero empieza siempre en tu interior. Ya estás ahí.',
        ],
      },
    ],
  },
  {
    id: 'emociones', label: 'Emociones difíciles', emoji: '🌊',
    themes: [
      {
        id: 'sadness', label: 'Tristeza',
        phrases: [
          'Es completamente válido sentir tristeza y no tienes que luchar contra ella ni apurarla. Déjala estar contigo como visitante, no como enemiga. Respirar juntos ya ayuda.',
          'Permite que la tristeza esté contigo en este momento sin que se instale permanentemente ni te defina. Puede existir aquí y también pasar. Las dos cosas son ciertas.',
          'Respira suavemente y dale espacio generoso a lo que sientes sin catalogarlo ni juzgarlo. Solo observa con la misma gentileza que le darías a alguien que amas. Esa gentileza también es para ti.',
          'La tristeza es señal de que algo o alguien te importa profundamente. Eso no es debilidad — es profundamente humano y hermoso. Solo los que aman sienten esto.',
          'No estás roto ni rota. Estás procesando algo difícil y eso requiere tiempo y espacio. Hay una diferencia enorme entre estar roto y estar en proceso de sanar.',
          'Con cada respiración profunda, generas un pequeño espacio de alivio dentro de ti. Ese espacio no anula la tristeza — convive con ella. Y en ese espacio puedes respirar.',
          'Los sentimientos, incluso los más pesados y oscuros, son temporales y pasajeros. Ninguna emoción dura para siempre, aunque en el momento lo parezca. Esta también pasará.',
          'Date la misma compasión real que le darías sin pensarlo a un amigo que está pasando por lo mismo. Sin condiciones, sin prisa, sin juicio. Eso es lo que mereces ahora.',
          'Hay luz en ti incluso cuando no la sientes ni la puedes ver. Esto que sientes no es todo lo que eres ni define lo que serás. Es un momento pasajero en una historia mucho más amplia.',
          'No tienes que entender por qué te sientes así ni encontrar la causa lógica. Solo tienes que atravesarlo con gentileza y presencia. El entendimiento llegará después, por sí solo.',
          'Cada respiración profunda activa tu sistema nervioso parasimpático, el que calma y sana. Tu cuerpo ya está respondiendo y ayudando. Confía en ese proceso natural.',
          'Al terminar llevarás un poco más de ligereza contigo. La tristeza irá cediendo espacio poco a poco. No hoy todo, pero sí algo. Y eso cuenta.',
        ],
      },
      {
        id: 'anger', label: 'Ira o frustración',
        phrases: [
          'Sientes algo muy intenso en este momento y eso está bien. Este espacio es completamente seguro para ti y para lo que sientes. No tienes que controlarlo ahora mismo.',
          'La ira es energía poderosa. Ahora la dirigimos hacia adentro para comprenderla, no hacia afuera para destruir. Esa redirección es tu fuerza.',
          'Respira profundo y lento, más lento de lo normal. Tu sistema nervioso necesita esta señal clara de calma para salir del modo alarma. Cada respiración cuenta.',
          'Detrás de toda ira genuina hay una necesidad no satisfecha que grita para ser atendida. ¿Cuál es la tuya en este momento? Identifícala con honestidad y sin juzgarte.',
          'Puedes sentir la ira completamente sin que ella te controle ni te defina. Sentir no es actuar. Puedes estar furioso y elegir cómo responder. Esa es tu libertad.',
          'Con cada exhalación, liberas presión acumulada como una válvula que se abre suavemente y con control. No es explosión — es liberación consciente y gradual. Tu ritmo.',
          'La respuesta que emerge de la calma tiene infinitamente más poder transformador que la que viene de la rabia. Esto no es rendirse — es volverse más efectivo. Espera ese estado.',
          'Observa la ira sin identificarte con ella. Tú eres el observador de esa emoción, no la emoción misma. Desde esa perspectiva tienes mucho más poder y claridad.',
          'Cuando la ira pasa, generalmente queda algo más suave debajo — dolor, miedo, frustración. Permite que emerja ese algo más blando. Ahí están las respuestas reales.',
          'Tu bienestar y tu paz interior son más valiosos que ganar cualquier discusión o tener razón. Esa claridad de prioridades es sabiduría en acción. Respira hacia ella.',
          'Cada respiración profunda reduce el cortisol activo en tu sangre y la tensión en tus músculos. Tu cuerpo ya está sanando y regulándose. Ayúdalo con otra respiración más.',
          'Al salir de aquí podrás responder desde la claridad en lugar de reaccionar desde el dolor. Esa diferencia cambia completamente el resultado. Vale cada segundo de esta pausa.',
        ],
      },
      {
        id: 'fear', label: 'Miedo o incertidumbre',
        phrases: [
          'El miedo que sientes es real y tiene razón de existir. También lo es tu capacidad para atravesarlo sin que te destruya. Las dos cosas son verdad al mismo tiempo.',
          'Respira y ancla toda tu atención en este momento presente. Aquí, ahora mismo, estás a salvo. El miedo vive en el futuro — tú vives en este instante.',
          'No puedes controlar cómo resultará el futuro incierto. Pero sí puedes estar bien en este preciso instante. Eso es todo lo que se te pide ahora mismo.',
          'Tu mente está generando escenarios posibles y probables. Trae gentilmente la atención de vuelta a tu respiración. Es tu ancla al único momento que existe: este.',
          'Has atravesado momentos difíciles e inciertos antes y saliste adelante. Llevas ese aprendizaje y esa capacidad contigo ahora. Tu historial habla por ti.',
          'La incertidumbre es una condición permanente de la vida humana, no un error ni un fallo. Tu capacidad de adaptarte y seguir adelante también lo es. Son compañeras.',
          'Con cada respiración lenta y profunda, activas tu sistema nervioso parasimpático, el sistema de calma. Tu cuerpo responde de inmediato. Estás cambiando tu estado fisiológico.',
          'No tienes que saber cómo va a resultar todo para poder estar bien en este momento. La paz no depende de la certeza. Puede existir en la incertidumbre.',
          'El miedo al futuro existe en tu mente como un escenario imaginado. Tu cuerpo, en cambio, solo existe en este momento presente. Regresa a él con tu respiración.',
          'Confía en la versión futura de ti que ya sabrá qué hacer con lo que venga. Esa versión existe y está siendo formada por cómo atraviesas este momento. Estás creciendo.',
          'Eres más resiliente de lo que crees en este momento de miedo. Tu historia lo prueba en cada página. Confía en esa evidencia concreta.',
          'Al salir de aquí llevarás más calma, más confianza y más fe en tu capacidad de avanzar. No certeza sobre el resultado, sino confianza en ti mismo. Eso es más valioso.',
        ],
      },
    ],
  },
  {
    id: 'bienestar', label: 'Bienestar diario', emoji: '☀️',
    themes: [
      {
        id: 'morning', label: 'Inicio del día',
        phrases: [
          'Buenos días. Este es el primer momento de un nuevo día completamente tuyo. Antes de que el mundo te reclame nada, este espacio te pertenece.',
          'Antes de que el mundo te reclame y la agenda empiece, tómate este tiempo real para ti. Es el regalo más importante que puedes darte cada mañana. Comienza desde adentro.',
          'Siente cómo tu cuerpo despierta gradualmente con cada respiración consciente que haces. Los músculos se alargan, la mente se clarifica, la energía emerge. Observa ese proceso.',
          'Hoy es una nueva oportunidad real y completa. Lo que pasó ayer quedó en el pasado donde pertenece. Tienes una página nueva esperando.',
          '¿Cómo quieres sentirte hoy? Establece esa intención clara y específica ahora. No lo que tienes que hacer — cómo quieres estar mientras lo haces.',
          'Tu cuerpo y tu mente están preparándose juntos para el día. Ayúdalos con calma, con presencia y con gratitud. Esta preparación marca la diferencia.',
          'Piensa en una cosa pequeña y concreta que quieras disfrutar genuinamente hoy. Un café, una conversación, un momento de sol. Eso también es el día.',
          'No necesitas tener todo planificado ni controlado para comenzar con fuerza. Solo necesitas empezar con presencia y con intención. El resto se ordena.',
          'Este momento de quietud al inicio del día es un regalo poderoso que te estás dando. Los estudios lo confirman — las mañanas conscientes cambian el día. Estás haciendo algo real.',
          'Llevas contigo todo lo que necesitas para el día que comienza. La capacidad, la experiencia, la intención. Es más de lo que crees.',
          'Respira profundo y llena tu cuerpo de la energía tranquila y enfocada que necesitas. Cada célula recibe ese oxígeno. Tu día empieza desde adentro hacia afuera.',
          'Bienvenido a tu día. Comienza desde adentro hacia afuera, desde la calma hacia la acción. Desde este momento de quietud hacia todo lo que viene.',
        ],
      },
      {
        id: 'evening', label: 'Cierre del día',
        phrases: [
          'El día está terminando y es hora de soltar conscientemente todo lo que fue. Lo bueno que fue, con gratitud. Lo difícil que fue, con gentileza. Ambos merecen ese cierre.',
          'Repasa mentalmente el día sin juzgarlo ni calificarlo. Solo observa lo que pasó como un espectador compasivo. No hay que sacar nota — hay que soltar.',
          '¿Qué salió bien hoy, grande o pequeño? Dale el reconocimiento genuino que merece antes de dejarlo ir. Reconocer lo bueno no es vanidad — es honestidad.',
          '¿Qué fue difícil o doloroso hoy? Suéltalo con gentileza y sin dramatismo. Ya hiciste lo que pudiste con los recursos que tenías. Eso fue suficiente.',
          'Tu cuerpo cargó muchas cosas hoy — físicas, emocionales, mentales. Dale las gracias por todo lo que sostuvo sin quejarse. Y permítele descansar ahora de verdad.',
          'Con cada exhalación, vas depositando conscientemente el peso del día en algún lugar que no sea tu cuerpo. Mañana lo recoges si lo necesitas. Esta noche, descansa.',
          'Mañana habrá otra oportunidad para lo que quedó pendiente o sin resolver. Esta noche es para descansar, no para resolver. Pon límites a tus pensamientos de trabajo.',
          'Recuerda a alguien que te alegró hoy, aunque sea con algo pequeño e insignificante. Una sonrisa, una palabra, un gesto. Ese momento también existió y merece reconocimiento.',
          'Estás a salvo en este momento. El día terminó y no hay nada más que resolver ahora. Puedes soltar la vigilancia constante y descansar de verdad.',
          'Tu mente merece descansar tanto como tu cuerpo después de un día largo. Deja ir los pendientes hasta mañana, cuando estarás más descansado. No los resuelves ahora de todas formas.',
          'Lo que no se resolvió hoy puede esperar pacientemente a mañana cuando tengas más energía. Tú no puedes esperar el descanso que tu cuerpo necesita. Prioriza bien.',
          'Cierra este día con gratitud genuina por lo que fue. Hiciste lo que pudiste con lo que tenías. Fue suficiente. Eso siempre es suficiente.',
        ],
      },
      {
        id: 'gratitude', label: 'Gratitud',
        phrases: [
          'Detente un momento real y observa lo que tienes con claridad, no lo que te falta. El equilibrio entre ambos es lo que te da perspectiva. Comienza por lo que sí está.',
          'Piensa en una persona concreta que haya traído luz, calor o alegría a tu vida hoy, aunque sea con algo pequeño. Siente gratitud por su existencia en tu historia.',
          'Tu cuerpo respira, late y se mueve en este momento sin que tengas que pedírselo. Eso es un regalo extraordinario y cotidiano que muchos no pueden dar por sentado. Agrádecelo.',
          'Hay algo en tu vida que das completamente por sentado y que alguien más desearía tener. ¿Qué es? Nómbralo internamente y siente el peso real de ese regalo.',
          'La gratitud no niega el dolor ni borra lo difícil que ha sido. Solo le da espacio también a lo que es bueno y verdadero. Los dos pueden coexistir honestamente.',
          'Con cada inhalación, recibes el regalo del aire, del oxígeno y de la vida. Con cada exhalación, agradeces y devuelves. Es el ciclo más básico y más sagrado.',
          'Piensa en algo de la naturaleza que genuinamente te guste — el sol, el cielo, la lluvia, el viento. Todo eso existe y está disponible gratuitamente para ti. Nada te lo cobra.',
          'Hay personas en tu vida que te quieren de manera genuina. Siente ese calor real en tu pecho por un momento, aunque estén lejos. Ese amor existe ahora mismo.',
          'La gratitud transforma lo ordinario en suficiente y lo suficiente en abundancia. Es una de las prácticas más poderosas que existen para cambiar la percepción de la realidad.',
          'Cuando salgas de aquí, lleva esta mirada agradecida al resto del día y a las personas que encuentres. El mundo se ve diferente desde la gratitud. Pruébalo.',
          'Tu historia, con todo y sus dificultades, cicatrices y errores, te ha formado como quien eres hoy. Eso también merece gratitud genuina. Nada fue en vano.',
          'Eres suficiente. Tienes suficiente. En este momento preciso, hay paz disponible para ti. Todo lo que necesitas está aquí.',
        ],
      },
    ],
  },
  {
    id: 'salud', label: 'Salud y cuerpo', emoji: '🌿',
    themes: [
      {
        id: 'health-anxiety', label: 'Ansiedad por salud',
        phrases: [
          'Tu cuerpo es profundamente sabio. Ha superado cosas difíciles antes y sabe cómo cuidarse con los recursos que tiene. Confía en esa inteligencia innata.',
          'La ansiedad por la salud amplifica las señales normales del cuerpo y las convierte en amenazas. Esta respiración calma el sistema de alarma. Estás cambiando la señal.',
          'Respira profundo y consciente, llevando oxígeno y calma a cada parte de tu cuerpo. Siente cómo ese oxígeno llega incluso a los lugares donde sientes tensión.',
          'No tienes que tener certeza absoluta sobre todo para poder estar bien en este momento presente. La certeza no es condición para la paz. La paz puede existir con incertidumbre.',
          'La preocupación excesiva no protege tu salud ni previene nada — pero la paz interior sí apoya activamente los sistemas de sanación. Estás eligiendo lo que funciona.',
          'Con cada respiración, activas el sistema nervioso parasimpático — el que sana, regenera y descansa. No el que alarma. Estás usando tu cuerpo a favor de tu bienestar.',
          'Tu cuerpo y tú están completamente del mismo lado. No son adversarios — son socios. Trabaja con él, no contra él, y notarás la diferencia.',
          'Deja ir por unos minutos los escenarios negativos que tu mente genera. Solo existe este aliento, este momento, este cuerpo que funciona ahora mismo. Regresa a eso.',
          'La mente catastrófica no es la realidad objetiva — es un hábito de pensamiento modificable. Vuelve al presente donde tu cuerpo, ahora mismo, está aquí y funcionando.',
          'Agradece lo que tu cuerpo hace bien hoy — cada función, cada movimiento, cada sentido. Hay mucho si lo buscas con honestidad. Más de lo que la ansiedad te deja ver.',
          'Estás haciendo lo correcto al cuidarte y prestar atención. La preocupación excesiva no ayuda — este tipo de cuidado consciente sí ayuda genuinamente. Sigue aquí.',
          'Al terminar lleva una relación más amable, más colaborativa y menos ansiosa con tu cuerpo. Él es tu aliado. Trátalo como tal.',
        ],
      },
      {
        id: 'fatigue', label: 'Cansancio o agotamiento',
        phrases: [
          'Tu cuerpo pidió pausa con claridad y tú escuchaste esa señal. Esta sesión es exactamente lo que necesitas ahora. Bien hecho por estar aquí.',
          'No tienes que hacer nada más en este momento. No producir, no resolver, no responder nada. Solo respirar. Eso es todo lo que se te pide.',
          'El cansancio que sientes es real, legítimo y merece ser reconocido con honestidad. No lo minimices ni lo ignores. Es una señal de que das mucho. Atiéndela.',
          'Con cada respiración profunda, llevas oxígeno renovador a cada célula de tu cuerpo que lo necesita. Siente ese alivio inmediato moverse por tus tejidos. Tu cuerpo agradece cada aliento.',
          'El descanso no es rendirse ni fallar. Es recargar inteligentemente para poder seguir mejor y más lejos. Los atletas lo saben. Ahora tú también.',
          'Imagina que con cada exhalación lenta, expulsas el cansancio acumulado que llevas en el cuerpo. Con cada inhalación, recibes energía renovada. Ese intercambio real está ocurriendo.',
          'Tu cuerpo tiene una capacidad extraordinaria para recuperarse cuando se le da el espacio adecuado. Dale ese espacio ahora, sin prisa y sin condiciones. Observa cómo responde.',
          'No todo tiene que hacerse hoy y no todo puede esperar indefinidamente. Aprende a distinguir. Algunas cosas genuinamente pueden esperar tu energía renovada.',
          'Siente el apoyo real de lo que te sostiene físicamente ahora mismo. Suéltate completamente en esa superficie. No tienes que sostener tu propio peso ahora.',
          'El descanso también es profundamente productivo — los mejores creadores, atletas y pensadores lo saben y lo practican. No es tiempo perdido. Es inversión directa.',
          'Mereces restaurarte completamente. No como lujo ocasional, sino como necesidad fundamental de cualquier ser humano que da mucho. Reclama ese derecho ahora.',
          'Al terminar tendrás un poco más de energía y claridad para lo que realmente importa. No todo, pero sí algo más. Y ese algo más cambia cómo se ve el resto del día.',
        ],
      },
      {
        id: 'pain', label: 'Dolor o tensión física',
        phrases: [
          'Tu cuerpo te habla a través del dolor y la tensión. Escúchalo con gentileza y sin resistencia. Esa escucha ya es parte de la sanación.',
          'Lleva conscientemente tu respiración hacia el lugar específico donde sientes tensión o incomodidad. Imagina que el aire llega directo a esa zona. Nota qué pasa.',
          'No tienes que luchar contra el dolor para que disminuya. A veces simplemente observarlo con calma y sin resistencia lo transforma. Pruébalo con curiosidad.',
          'Con cada inhalación profunda, llevas calor, oxígeno y alivio a esa zona específica de tu cuerpo. Imagina una luz cálida que se expande hacia ese lugar con cada respiración.',
          'Imagina que tu respiración es una ola suave y constante que masajea gentilmente esa tensión desde adentro. Suave, sin forzar. Con cada ciclo, algo cede un poco.',
          'El sistema nervioso y el dolor están profundamente conectados. Lo que calma el sistema nervioso reduce la percepción del dolor. Esta práctica ayuda a ambos directamente.',
          'No eres tu dolor ni te defines por él. Eres el observador compasivo de esa sensación. Desde esa perspectiva tienes más distancia y más paz.',
          'Con cada exhalación consciente, dejas ir una pequeña fracción de esa tensión acumulada. No tienes que soltarla toda de golpe. Poco a poco, respiración a respiración.',
          'Tu cuerpo merece cuidado genuino, atención amable y gentileza real, no juicio ni impaciencia. Trátalo como tratarías a alguien que sufre y que necesita compasión.',
          'Esta pausa consciente ya es medicina real para tu sistema nervioso y para la percepción del dolor. No estás esperando — estás actuando. Esto cuenta.',
          'Hay recursos de sanación dentro de ti que se activan específicamente con la calma y la respiración profunda. Estás accediendo a ellos ahora mismo. Confía en ese proceso.',
          'Al terminar llevarás una relación más compasiva, más paciente y más amable con tu cuerpo. Esa relación afecta directamente cómo experimentas el dolor. Vale cultivarla.',
        ],
      },
    ],
  },
];

const COMPLETION_QUOTES = [
  'La paz no es algo que encuentras afuera. Es algo que construyes adentro.',
  'Cada vez que te detienes a respirar conscientemente, te eliges a ti mismo.',
  'Meditar no es vaciar la mente. Es aprender a observarla con compasión.',
  'Eres más que tus pensamientos. Eres el espacio donde los pensamientos ocurren.',
  'La quietud no es ausencia de vida. Es la vida más plena.',
  'Cada respiración consciente es un acto de amor hacia ti mismo.',
  'No importa cuánto duró. Importa que lo elegiste.',
  'Cuando te cuidas a ti mismo, tienes más para dar a los demás.',
  'La mente que descansa crea más que la mente que no para.',
  'Hoy demostraste que puedes detenerte. Eso es mucho en un mundo que no para.',
  'El bienestar no es un destino. Es la dirección en la que caminas.',
  'Tu respiración te acompañará toda tu vida. Vale la pena conocerla bien.',
  'Así como cuidas tu cuerpo con ejercicio, cuidas tu mente con meditación.',
  'La calma que sientes ahora siempre estará disponible para ti.',
  'No tienes que merecerte el descanso. Lo necesitas, y eso es suficiente.',
  'En el silencio encontraste algo que el ruido no puede darte.',
  'Hoy sembraste una semilla de consciencia. Con el tiempo, crecerá.',
  'Cada sesión te hace más hábil para volver a ti mismo.',
  'El camino hacia afuera empieza siempre hacia adentro.',
  'Tu bienestar es la base de todo lo demás que construyes.',
];

// ── Phrase selection ───────────────────────────────────────────────────────────

const selectPhrases = (phrases, durationMins) => {
  const count = durationMins <= 3 ? 4 : durationMins <= 5 ? 7 : 12;
  if (phrases.length <= count) return phrases;
  const step = (phrases.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => phrases[Math.round(i * step)]);
};

const phraseTimes = (totalSecs, count) => {
  if (!count) return [];
  const a = Math.floor(totalSecs * 0.08);
  const b = Math.floor(totalSecs * 0.88);
  if (count === 1) return [a];
  return Array.from({ length: count }, (_, i) => Math.floor(a + i * (b - a) / (count - 1)));
};

const findTheme = (id) => {
  for (const g of THEME_GROUPS) {
    const t = g.themes.find(t => t.id === id);
    if (t) return t;
  }
  return null;
};

// ── Audio synthesis ────────────────────────────────────────────────────────────

const buildNoiseBuf = (ctx, pink = false) => {
  const sr = ctx.sampleRate, len = sr * 5;
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (pink) {
        b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
        b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
        b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
        d[i] = (b0+b1+b2+b3+b4+b5+b6+w*0.5362)/8; b6=w*0.115926;
      } else { d[i] = w; }
    }
  }
  return buf;
};

const makeSource = (ctx, pink = false) => {
  const src = ctx.createBufferSource();
  src.buffer = buildNoiseBuf(ctx, pink);
  src.loop = true;
  return src;
};

const startAmbient = (type, ctx) => {
  if (type === 'none') return null;
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  master.gain.setTargetAtTime(0.35, ctx.currentTime, 2);
  const nodes = [];

  const addLFO = (rate, depth, targetParam) => {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = rate; lg.gain.value = depth;
    lfo.connect(lg); lg.connect(targetParam);
    lfo.start(); nodes.push(lfo, lg);
  };

  switch (type) {
    case 'rain': {
      const src = makeSource(ctx, false);
      const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=380; bp.Q.value=1.8;
      const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=200;
      const src2 = makeSource(ctx, false);
      const bp2 = ctx.createBiquadFilter(); bp2.type='bandpass'; bp2.frequency.value=700; bp2.Q.value=3;
      const g2 = ctx.createGain(); g2.gain.value=0.15;
      src.connect(bp); bp.connect(hp); hp.connect(master);
      src2.connect(bp2); bp2.connect(g2); g2.connect(master);
      addLFO(1.8, 0.06, master.gain);
      src.start(); src2.start(); nodes.push(src, bp, hp, src2, bp2, g2);
      break;
    }
    case 'ocean': {
      const src = makeSource(ctx, true);
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=500;
      addLFO(0.08, 0.22, master.gain);
      addLFO(0.13, 0.1, master.gain);
      src.connect(lp); lp.connect(master); src.start(); nodes.push(src, lp);
      break;
    }
    case 'forest': {
      const src = makeSource(ctx, true);
      const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=750; bp.Q.value=0.6;
      master.gain.setTargetAtTime(0.14, ctx.currentTime, 2);
      addLFO(0.3, 0.04, master.gain);
      src.connect(bp); bp.connect(master); src.start(); nodes.push(src, bp);
      break;
    }
    case 'river': {
      const src = makeSource(ctx, true);
      const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=600; bp.Q.value=1.2;
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1200;
      addLFO(0.6, 0.08, master.gain);
      addLFO(1.1, 0.05, master.gain);
      src.connect(bp); bp.connect(lp); lp.connect(master); src.start(); nodes.push(src, bp, lp);
      break;
    }
    case 'wind': {
      const src = makeSource(ctx, true);
      const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=400;
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=2000;
      master.gain.setTargetAtTime(0.2, ctx.currentTime, 2);
      addLFO(0.15, 0.18, master.gain);
      addLFO(0.4, 0.06, master.gain);
      src.connect(hp); hp.connect(lp); lp.connect(master); src.start(); nodes.push(src, hp, lp);
      break;
    }
    case 'fire': {
      const src = makeSource(ctx, false);
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=220;
      const lfo = ctx.createOscillator(); const lg = ctx.createGain();
      lfo.type='sawtooth'; lfo.frequency.value=3.8; lg.gain.value=0.07;
      lfo.connect(lg); lg.connect(master.gain); lfo.start();
      master.gain.setTargetAtTime(0.22, ctx.currentTime, 2);
      src.connect(lp); lp.connect(master); src.start(); nodes.push(src, lp, lfo, lg);
      break;
    }
    case 'space': {
      const src = makeSource(ctx, true);
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=100;
      const osc = ctx.createOscillator(); const og = ctx.createGain();
      osc.type='sine'; osc.frequency.value=50; og.gain.value=0.06;
      osc.connect(og); og.connect(master); osc.start();
      master.gain.setTargetAtTime(0.18, ctx.currentTime, 2);
      src.connect(lp); lp.connect(master); src.start(); nodes.push(src, lp, osc, og);
      break;
    }
    default: break;
  }

  return {
    fadeOut: () => {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.8);
      setTimeout(() => {
        nodes.forEach(n => { try { if (n.stop) n.stop(); n.disconnect(); } catch {} });
        try { master.disconnect(); } catch {}
      }, 2800);
    },
  };
};

// ── TTS ────────────────────────────────────────────────────────────────────────

const speakWebSpeech = (text, onEnd) => {
  if (!window.speechSynthesis) { onEnd?.(); return null; }
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'es-ES'; utt.rate = 0.78; utt.pitch = 0.92; utt.volume = 1;
  const trySpeak = () => {
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(v => v.lang.startsWith('es') && v.localService) || voices.find(v => v.lang.startsWith('es'));
    if (v) utt.voice = v;
    if (onEnd) utt.onend = onEnd;
    window.speechSynthesis.speak(utt);
  };
  if (window.speechSynthesis.getVoices().length) trySpeak();
  else window.speechSynthesis.onvoiceschanged = trySpeak;
  return utt;
};

const decodeBase64Audio = async (ctx, base64) => {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return ctx.decodeAudioData(bytes.buffer);
};

const playAudioBuffer = (ctx, buffer, onEnd) => {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain(); g.gain.value = 1.0;
  src.connect(g); g.connect(ctx.destination);
  if (onEnd) src.onended = onEnd;
  src.start();
  return src;
};

// ── Breathing ──────────────────────────────────────────────────────────────────

const BREATH = [
  { label: 'Inhala',   secs: 4, scale: 1.38 },
  { label: 'Mantén',   secs: 2, scale: 1.38 },
  { label: 'Exhala',   secs: 4, scale: 1.0  },
  { label: 'Descansa', secs: 2, scale: 1.0  },
];
const BREATH_CYCLE = BREATH.reduce((s, b) => s + b.secs, 0);

const getBreathStep = (elapsed) => {
  const pos = elapsed % BREATH_CYCLE;
  let acc = 0;
  for (const step of BREATH) { acc += step.secs; if (pos < acc) return step; }
  return BREATH[0];
};

// ── Component ──────────────────────────────────────────────────────────────────

const RING_R    = 16;
const RING_CIRC = 2 * Math.PI * RING_R;

const Meditate = () => {
  const { user } = useAuth();

  // step: 'setup' | 'session' | 'complete'
  const [step, setStep]               = useState('setup');
  const [showThemes, setShowThemes]    = useState(false);
  const [themeMode, setThemeMode]      = useState('preset'); // 'preset' | 'custom'
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [sound, setSound]             = useState('rain');
  const [duration, setDuration]       = useState(DURATIONS[1]);
  const [themeId, setThemeId]         = useState(null);
  const [customText, setCustomText]   = useState('');
  const [isLoading, setIsLoading]     = useState(false);
  const [previewId, setPreviewId]     = useState(null);
  const [previewProgress, setPreviewProgress] = useState(0);

  const [todayCount, setTodayCount]   = useState(0);

  const [elapsed, setElapsed]         = useState(0);
  const [totalSecs, setTotalSecs]     = useState(0);
  const [phrase, setPhrase]           = useState('');
  const [phraseOn, setPhraseOn]       = useState(false);
  const [completionQuote, setCompletionQuote] = useState('');
  const [completedMeta, setCompletedMeta]     = useState(null);

  const audioCtxRef     = useRef(null);
  const ambientRef      = useRef(null);
  const previewCtxRef   = useRef(null);
  const previewRef      = useRef(null);
  const previewTimerRef = useRef(null);
  const previewProgRef  = useRef(null);
  const intervalRef     = useRef(null);
  const phrasesRef      = useRef([]);
  const timesRef        = useRef([]);
  const spokenRef       = useRef(new Set());
  const audioBuffsRef   = useRef([]);
  const ttsSrcRef       = useRef(null);

  const breathStep = step === 'session' ? getBreathStep(elapsed) : BREATH[0];

  useEffect(() => {
    if (!user) return;
    const todayStr = toLocalDateStr(new Date());
    getDoc(doc(db, `users/${user.uid}/wellbeing`, 'data')).then(snap => {
      if (snap.exists()) setTodayCount((snap.data().meditations?.[todayStr] || []).length);
    });
  }, [user]);

  // ── Sound preview ──
  const startPreview = useCallback((id) => {
    if (previewRef.current) { previewRef.current.fadeOut(); previewRef.current = null; }
    if (previewCtxRef.current) { setTimeout(() => { try { previewCtxRef.current?.close(); } catch {} previewCtxRef.current = null; }, 3000); }
    clearInterval(previewProgRef.current);
    clearTimeout(previewTimerRef.current);

    if (id === 'none') { setPreviewId(null); setPreviewProgress(0); return; }

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    previewCtxRef.current = ctx;
    previewRef.current = startAmbient(id, ctx);
    setPreviewId(id);
    setPreviewProgress(0);

    let prog = 0;
    previewProgRef.current = setInterval(() => {
      prog += 1;
      setPreviewProgress(prog);
      if (prog >= 100) clearInterval(previewProgRef.current);
    }, 50);

    previewTimerRef.current = setTimeout(() => {
      previewRef.current?.fadeOut(); previewRef.current = null;
      setTimeout(() => { try { ctx.close(); } catch {} previewCtxRef.current = null; }, 3000);
      clearInterval(previewProgRef.current);
      setPreviewId(null);
      setPreviewProgress(0);
    }, 5000);
  }, []);

  const stopPreview = useCallback(() => {
    previewRef.current?.fadeOut(); previewRef.current = null;
    setTimeout(() => { try { previewCtxRef.current?.close(); } catch {} previewCtxRef.current = null; }, 3000);
    clearInterval(previewProgRef.current);
    clearTimeout(previewTimerRef.current);
    setPreviewId(null);
    setPreviewProgress(0);
  }, []);

  // ── Show phrase ──
  const showPhrase = useCallback((text, buffer, ctx) => {
    if (ttsSrcRef.current) { try { ttsSrcRef.current.stop(); } catch {} ttsSrcRef.current = null; }
    setPhraseOn(false);
    setTimeout(() => {
      setPhrase(text);
      setPhraseOn(true);
      const onEnd = () => setTimeout(() => setPhraseOn(false), 1800);
      if (buffer && ctx) {
        ttsSrcRef.current = playAudioBuffer(ctx, buffer, onEnd);
      } else {
        speakWebSpeech(text, onEnd);
      }
    }, 350);
  }, []);

  // ── Stop session ──
  const stopSession = useCallback((completed = false) => {
    clearInterval(intervalRef.current);
    window.speechSynthesis?.cancel();
    if (ttsSrcRef.current) { try { ttsSrcRef.current.stop(); } catch {} ttsSrcRef.current = null; }
    ambientRef.current?.fadeOut(); ambientRef.current = null;
    if (audioCtxRef.current) {
      setTimeout(() => { try { audioCtxRef.current?.close(); } catch {} audioCtxRef.current = null; }, 3200);
    }
    if (!completed) {
      setStep('setup'); setShowThemes(false); setElapsed(0); setPhrase(''); setPhraseOn(false);
      spokenRef.current = new Set(); audioBuffsRef.current = [];
    }
  }, []);

  // ── Save meditation (only on natural completion) ──
  const saveMeditation = useCallback(async (themeLabel, durationMins, tid) => {
    if (!user) return;
    const todayStr = toLocalDateStr(new Date());
    try {
      const ref = doc(db, `users/${user.uid}/wellbeing`, 'data');
      const snap = await getDoc(ref);
      const existing = snap.exists() ? (snap.data().meditations || {}) : {};
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);
      const cleaned = Object.fromEntries(
        Object.entries(existing).filter(([d]) => new Date(d) >= cutoff)
      );
      const todayMeds = cleaned[todayStr] || [];
      cleaned[todayStr] = [...todayMeds, { at: new Date().toISOString(), mins: durationMins, themeId: tid, themeLabel }];
      await setDoc(ref, { meditations: cleaned }, { merge: true });
      setTodayCount(c => c + 1);
    } catch { /* non-critical */ }
  }, [user]);

  // ── Begin session ──
  const beginSession = useCallback((phrases, secs, buffers, onComplete) => {
    phrasesRef.current    = phrases;
    timesRef.current      = phraseTimes(secs, phrases.length);
    spokenRef.current     = new Set();
    audioBuffsRef.current = buffers || [];

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;
    ambientRef.current  = startAmbient(sound, ctx);

    setTotalSecs(secs); setElapsed(0); setStep('session');

    if (phrases.length) {
      const buf = audioBuffsRef.current[0] || null;
      setTimeout(() => { showPhrase(phrases[0], buf, ctx); spokenRef.current.add(0); }, 2800);
    }

    intervalRef.current = setInterval(() => {
      setElapsed(prev => {
        const next = prev + 1;
        timesRef.current.forEach((t, i) => {
          if (i > 0 && !spokenRef.current.has(i) && next >= t) {
            spokenRef.current.add(i);
            showPhrase(phrasesRef.current[i], audioBuffsRef.current[i] || null, audioCtxRef.current);
          }
        });
        if (next >= secs) {
          clearInterval(intervalRef.current);
          setTimeout(() => {
            stopSession(true);
            onComplete?.();
            setCompletionQuote(COMPLETION_QUOTES[Math.floor(Math.random() * COMPLETION_QUOTES.length)]);
            setStep('complete');
          }, 500);
        }
        return next;
      });
    }, 1000);
  }, [sound, showPhrase, stopSession]);

  // ── Handle start ──
  const handleStart = async () => {
    const isCustom = themeMode === 'custom';
    if (!isCustom && !themeId) { toast.error('Selecciona una temática'); return; }
    if (isCustom && !customText.trim()) { toast.error('Escribe sobre qué quieres meditar'); return; }

    setIsLoading(true);
    let rawPhrases = [];
    let themeLabel = 'Personalizado';
    const tid = isCustom ? 'custom' : themeId;

    try {
      if (isCustom) {
        const count = duration.mins <= 3 ? 4 : duration.mins <= 5 ? 7 : 12;
        const txt = await callClaude(
          `Eres un guía de meditación experto y compasivo. Genera exactamente ${count} frases cortas para una sesión de meditación guiada de ${duration.mins} minutos sobre: "${customText.trim()}". Cada frase máximo 2 oraciones. En español, segunda persona singular, relajantes y progresivas (apertura → profundidad → cierre). Responde SOLO con las frases, una por línea, sin numeración ni viñetas.`,
          520,
        );
        rawPhrases = txt.split('\n').map(l => l.trim()).filter(Boolean).slice(0, count);
      } else {
        const theme = findTheme(themeId);
        if (!theme) { toast.error('Selecciona una temática'); setIsLoading(false); return; }
        rawPhrases = selectPhrases(theme.phrases, duration.mins);
        themeLabel = theme.label;
      }

      const tmpCtx = new (window.AudioContext || window.webkitAudioContext)();
      const buffers = await Promise.all(rawPhrases.map(async (text) => {
        try {
          const b64 = await ttsSpeak(text);
          return await decodeBase64Audio(tmpCtx, b64);
        } catch { return null; }
      }));
      await tmpCtx.close();

      setIsLoading(false);
      setCompletedMeta({ mins: duration.mins, themeLabel });
      beginSession(rawPhrases, duration.secs, buffers, () => saveMeditation(themeLabel, duration.mins, tid));
    } catch {
      setIsLoading(false);
      toast.error('Error al iniciar la sesión');
    }
  };

  useEffect(() => () => {
    clearInterval(intervalRef.current);
    clearInterval(previewProgRef.current);
    clearTimeout(previewTimerRef.current);
    window.speechSynthesis?.cancel();
    try { audioCtxRef.current?.close(); } catch {}
    try { previewCtxRef.current?.close(); } catch {}
  }, []);

  const progress  = totalSecs ? elapsed / totalSecs : 0;
  const remaining = step === 'session' ? totalSecs - elapsed : duration.secs;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  // ── Active session ──────────────────────────────────────────────────────────
  if (step === 'session') {
    return (
      <div className="fixed inset-0 z-[100] meditation-bg flex flex-col items-center justify-center select-none">
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/30">
          <div className="h-full bg-emerald-500/70 transition-all duration-1000" style={{ width: `${progress * 100}%` }} />
        </div>
        <button onClick={() => stopSession(false)} className="absolute top-10 left-5 flex items-center gap-1.5 text-white/55 hover:text-white/90 transition-colors text-sm">
          <ChevronLeft className="w-4 h-4" /> Salir
        </button>
        <p className="absolute top-10 right-5 text-white/45 text-sm font-mono tracking-wider">{mm}:{ss}</p>

        <div className="flex flex-col items-center gap-10">
          <div className="relative flex items-center justify-center" style={{ width: 300, height: 300 }}>
            <div className="absolute rounded-full transition-all ease-in-out" style={{ width: 280, height: 280, background: 'rgba(110,231,183,0.08)', transform: `scale(${breathStep.scale})`, transitionDuration: `${breathStep.secs * 1000}ms` }} />
            <div className="absolute rounded-full transition-all ease-in-out" style={{ width: 230, height: 230, background: 'rgba(110,231,183,0.12)', transform: `scale(${breathStep.scale})`, transitionDuration: `${breathStep.secs * 1000}ms`, transitionDelay: '60ms' }} />
            <div
              className="absolute rounded-full transition-all ease-in-out flex items-center justify-center"
              style={{
                width: 160, height: 160,
                background: 'radial-gradient(circle at 38% 32%, rgba(167,243,208,0.85), rgba(52,211,153,0.70))',
                border: '1px solid rgba(167,243,208,0.5)',
                boxShadow: '0 0 70px rgba(52,211,153,0.35), 0 0 120px rgba(52,211,153,0.15), inset 0 1px 0 rgba(255,255,255,0.4)',
                transform: `scale(${breathStep.scale})`,
                transitionDuration: `${breathStep.secs * 1000}ms`,
                transitionDelay: '30ms',
              }}
            >
              <Wind className="w-9 h-9 text-white/70" />
            </div>
          </div>

          <p className="text-white/75 text-lg font-light tracking-[0.3em] uppercase">
            {breathStep.label}
          </p>

          <div className="px-10 text-center transition-all duration-700" style={{ opacity: phraseOn ? 1 : 0, transform: phraseOn ? 'translateY(0)' : 'translateY(10px)', minHeight: 72 }}>
            <p className="text-white/65 text-[15px] font-light leading-relaxed italic">"{phrase}"</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Completion ──────────────────────────────────────────────────────────────
  if (step === 'complete') {
    return (
      <div className="fixed inset-0 z-[100] meditation-bg flex flex-col items-center justify-center px-8 select-none">
        <div className="flex flex-col items-center gap-6 text-center max-w-sm">
          <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'radial-gradient(circle, rgba(167,243,208,0.9), rgba(52,211,153,0.75))', boxShadow: '0 0 60px rgba(52,211,153,0.4)' }}>
            <span className="text-3xl">🧘</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Meditación completada</h2>
            {completedMeta && (
              <p className="text-sm text-white/60 mt-1">{completedMeta.mins} min · {completedMeta.themeLabel}</p>
            )}
          </div>
          <div className="liquid-glass-panel rounded-2xl px-6 py-5">
            <p className="text-violet-900/80 text-[15px] font-light leading-relaxed italic">"{completionQuote}"</p>
          </div>
          <button
            onClick={() => {
              setStep('setup'); setShowThemes(false); setElapsed(0);
              setPhrase(''); setPhraseOn(false);
              spokenRef.current = new Set(); audioBuffsRef.current = [];
            }}
            className="btn-primary px-8 py-3 rounded-xl text-sm font-semibold"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  // ── Setup ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="font-bold text-gray-900 dark:text-gray-100" style={{ fontSize: 30 }}>Meditación</h1>
        {todayCount > 0 && (
          <div className="flex items-center gap-3 mt-3 px-4 py-3 rounded-2xl bg-violet-50/80 dark:bg-violet-900/20 border border-violet-200/70 dark:border-violet-800/50">
            <div className="w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center flex-shrink-0 text-lg">🧘</div>
            <div>
              <p className="text-sm font-bold text-violet-700 dark:text-violet-300">
                {todayCount === 1 ? '1 sesión completada hoy' : `${todayCount} sesiones hoy`}
              </p>
              <p className="text-xs text-violet-500 dark:text-violet-400 mt-0.5">
                {todayCount >= 2 ? '¡Excelente práctica!' : 'Sigue construyendo el hábito'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── AV section (hidden when showThemes) ── */}
      <div style={{ display: showThemes ? 'none' : 'block' }} className="space-y-6">
        {/* Duration */}
        <div className="space-y-3">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Duración</p>
          <div className="flex gap-2">
            {DURATIONS.map(d => (
              <button key={d.mins} onClick={() => setDuration(d)}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all border-2 ${
                  duration.mins === d.mins
                    ? 'border-emerald-400 bg-emerald-50/70 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                    : 'border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400'
                }`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sound */}
        <div className="space-y-3">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Sonido ambiente</p>
          <div className="grid grid-cols-2 gap-2">
            {SOUNDS.map(s => {
              const isPreviewing  = previewId === s.id;
              const isSelected    = sound === s.id;
              const anyPreviewing = !!previewId;
              return (
                <div key={s.id} onClick={() => setSound(s.id)} role="button" tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setSound(s.id)}
                  className={`relative rounded-2xl overflow-hidden transition-all border-2 cursor-pointer ${
                    isSelected ? 'border-emerald-400 ring-2 ring-emerald-300/50' : 'border-transparent'
                  }`}
                  style={{ height: 80 }}>
                  <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${s.from}, ${s.to})` }} />
                  <div className="absolute inset-0 flex items-center justify-between px-4">
                    <div className="flex items-center gap-2.5">
                      <s.Icon className="w-5 h-5 text-white/90" />
                      <span className="text-sm font-semibold text-white">{s.label}</span>
                    </div>
                    {s.id !== 'none' && (
                      <div className="relative w-9 h-9 flex-shrink-0">
                        {isPreviewing && (
                          <svg
                            className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
                            viewBox="0 0 36 36"
                          >
                            <circle cx="18" cy="18" r={RING_R} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" />
                            <circle
                              cx="18" cy="18" r={RING_R} fill="none"
                              stroke="white" strokeWidth="2.5" strokeLinecap="round"
                              strokeDasharray={RING_CIRC}
                              strokeDashoffset={RING_CIRC - (previewProgress / 100) * RING_CIRC}
                            />
                          </svg>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); isPreviewing ? stopPreview() : startPreview(s.id); }}
                          disabled={anyPreviewing && !isPreviewing}
                          className="absolute inset-0 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center transition-colors disabled:opacity-40"
                        >
                          {isPreviewing
                            ? <Square className="w-3 h-3 text-white fill-white" />
                            : <Play  className="w-3 h-3 text-white fill-white" />
                          }
                        </button>
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-white/50" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => { setShowThemes(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          className="btn-primary w-full py-4 text-base font-semibold flex items-center justify-center gap-2"
        >
          Continuar →
        </button>
      </div>

      {/* ── Theme section (hidden when !showThemes) ── */}
      <div style={{ display: showThemes ? 'block' : 'none' }} className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowThemes(false)} className="p-1 text-gray-400 hover:text-gray-600">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Escoge la temática</p>
        </div>

        {/* Toggle */}
        <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
          <button
            onClick={() => { setThemeMode('preset'); setThemeId(null); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              themeMode === 'preset'
                ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-100'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            Prediseñadas
          </button>
          <button
            onClick={() => { setThemeMode('custom'); setThemeId(null); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              themeMode === 'custom'
                ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-100'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            Personalizada
          </button>
        </div>

        {themeMode === 'preset' && (
          <div className="space-y-3">
            {/* Group grid */}
            <div className="grid grid-cols-2 gap-2">
              {THEME_GROUPS.map(group => (
                <button
                  key={group.id}
                  onClick={() => { setSelectedGroup(g => g === group.id ? null : group.id); setThemeId(null); }}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    selectedGroup === group.id
                      ? 'border-violet-400 bg-violet-50/70 dark:bg-violet-900/20 opacity-100'
                      : selectedGroup
                        ? 'border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 opacity-40'
                        : 'border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50'
                  }`}
                >
                  <span className="text-2xl block mb-1">{group.emoji}</span>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 leading-snug">{group.label}</span>
                </button>
              ))}
            </div>

            {/* Sub-themes */}
            {selectedGroup && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Elige un tema</p>
                {THEME_GROUPS.find(g => g.id === selectedGroup)?.themes.map(t => (
                  <button key={t.id} onClick={() => setThemeId(t.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                      themeId === t.id
                        ? 'border-violet-400 bg-violet-50/60 dark:bg-violet-900/20'
                        : 'border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50'
                    }`}>
                    <span className={`text-sm font-medium flex-1 ${themeId === t.id ? 'text-violet-800 dark:text-violet-300' : 'text-gray-700 dark:text-gray-300'}`}>{t.label}</span>
                    {themeId === t.id && <div className="w-2 h-2 rounded-full bg-violet-400 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {themeMode === 'custom' && (
          <textarea
            className="input-field resize-none w-full"
            rows={4}
            placeholder="Ej. Quiero meditar sobre una discusión que tuve con mi pareja acerca de..."
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            autoFocus
          />
        )}

        <button
          onClick={handleStart}
          disabled={isLoading || (themeMode === 'preset' && !themeId) || (themeMode === 'custom' && !customText.trim())}
          className="btn-primary w-full py-4 text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-50 sticky bottom-4"
        >
          {isLoading
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Preparando sesión...</>
            : <><Wind className="w-5 h-5" /> Comenzar meditación</>
          }
        </button>
      </div>
    </div>
  );
};

export default Meditate;
