/**
 * nutritionTips.ts — 50 daily nutrition tips for Fitsi AI
 *
 * Used for push notifications and in-app tip cards.
 * All tips are evidence-based, actionable, and written in neutral Spanish
 * suitable for a LATAM audience.
 *
 * Categories (5 tips each, 50 total):
 *   hydration, protein, fiber, vitamins, portions,
 *   timing, habits, mindful, exercise, sleep
 */

export interface NutritionTip {
  id: number;
  category:
    | 'hydration'
    | 'protein'
    | 'fiber'
    | 'vitamins'
    | 'portions'
    | 'timing'
    | 'habits'
    | 'mindful'
    | 'exercise'
    | 'sleep';
  title: string;
  body: string;
  emoji: string;
}

export const NUTRITION_TIPS: NutritionTip[] = [
  // ---------------------------------------------------------------------------
  // HYDRATION (5)
  // ---------------------------------------------------------------------------
  {
    id: 1,
    category: 'hydration',
    title: 'Empieza el dia con un vaso de agua',
    body: 'Beber agua al despertar reactiva tu metabolismo despues de horas sin liquidos. Intenta 250 ml antes del desayuno.',
    emoji: '\u{1F4A7}',
  },
  {
    id: 2,
    category: 'hydration',
    title: 'Calcula tu meta de agua diaria',
    body: 'Una guia practica: multiplica tu peso en kg por 30-35 ml. Si pesas 70 kg, apunta a unos 2.1-2.4 litros al dia.',
    emoji: '\u{1F4A7}',
  },
  {
    id: 3,
    category: 'hydration',
    title: 'Revisa el color de tu orina',
    body: 'Amarillo claro indica buena hidratacion. Si es oscuro, tu cuerpo necesita mas agua. Es el indicador mas simple.',
    emoji: '\u{1F4A7}',
  },
  {
    id: 4,
    category: 'hydration',
    title: 'Dale sabor natural a tu agua',
    body: 'Agrega rodajas de limon, pepino o menta a tu agua. Te ayudara a beber mas sin calorias ni azucar agregada.',
    emoji: '\u{1F4A7}',
  },
  {
    id: 5,
    category: 'hydration',
    title: 'Balancea cafe y agua',
    body: 'El cafe moderado (3-4 tazas) no deshidrata, pero por cada taza agrega un vaso extra de agua para equilibrar.',
    emoji: '\u{1F4A7}',
  },

  // ---------------------------------------------------------------------------
  // PROTEIN (5)
  // ---------------------------------------------------------------------------
  {
    id: 6,
    category: 'protein',
    title: 'Incluye proteina en cada comida',
    body: 'Distribuir proteina en 3-4 comidas mejora su absorcion y la sintesis muscular. No la concentres en una sola.',
    emoji: '\u{1F4AA}',
  },
  {
    id: 7,
    category: 'protein',
    title: 'Elige bien tus fuentes de proteina',
    body: 'Pollo, pescado, huevos, legumbres y lacteos son opciones accesibles. Varía para obtener distintos aminoacidos.',
    emoji: '\u{1F4AA}',
  },
  {
    id: 8,
    category: 'protein',
    title: 'Conoce tu necesidad diaria',
    body: 'La mayoria de adultos necesita entre 1.2 y 2.0 g de proteina por kg de peso segun su actividad fisica.',
    emoji: '\u{1F4AA}',
  },
  {
    id: 9,
    category: 'protein',
    title: 'Proteina vegetal: combinala bien',
    body: 'Arroz con frijoles, lentejas con pan o garbanzos con quinoa forman proteinas completas sin necesidad de carne.',
    emoji: '\u{1F4AA}',
  },
  {
    id: 10,
    category: 'protein',
    title: 'No olvides la proteina post-entreno',
    body: 'Consumir 20-40 g de proteina dentro de las 2 horas despues de ejercicio apoya la recuperacion muscular.',
    emoji: '\u{1F4AA}',
  },

  // ---------------------------------------------------------------------------
  // FIBER (5)
  // ---------------------------------------------------------------------------
  {
    id: 11,
    category: 'fiber',
    title: 'La fibra: tu aliada digestiva',
    body: 'La fibra regula el transito intestinal, controla el azucar en sangre y aumenta la saciedad. Meta: 25-30 g al dia.',
    emoji: '\u{1F33E}',
  },
  {
    id: 12,
    category: 'fiber',
    title: 'Fuentes faciles de fibra',
    body: 'Avena, frijoles, lentejas, frutas con cascara y verduras son excelentes. Empieza con lo que ya tienes en casa.',
    emoji: '\u{1F33E}',
  },
  {
    id: 13,
    category: 'fiber',
    title: 'Aumenta la fibra gradualmente',
    body: 'Agregar demasiada fibra de golpe puede causar molestias. Aumenta poco a poco y acompana con suficiente agua.',
    emoji: '\u{1F33E}',
  },
  {
    id: 14,
    category: 'fiber',
    title: 'Soluble e insoluble: ambas importan',
    body: 'La soluble (avena, frutas) regula colesterol. La insoluble (verduras, cereales) mejora el transito intestinal.',
    emoji: '\u{1F33E}',
  },
  {
    id: 15,
    category: 'fiber',
    title: 'Fibra y salud intestinal',
    body: 'La fibra alimenta las bacterias buenas de tu intestino. Una microbiota sana mejora tu inmunidad y tu animo.',
    emoji: '\u{1F33E}',
  },

  // ---------------------------------------------------------------------------
  // VITAMINS (5)
  // ---------------------------------------------------------------------------
  {
    id: 16,
    category: 'vitamins',
    title: 'Come un arcoiris de colores',
    body: 'Cada color de fruta o verdura aporta distintas vitaminas y antioxidantes. Varia los colores en tu plato.',
    emoji: '\u{1F34A}',
  },
  {
    id: 17,
    category: 'vitamins',
    title: 'Hierro + vitamina C = mejor absorcion',
    body: 'Si comes lentejas o espinacas, agrega limon o pimiento. La vitamina C puede triplicar la absorcion de hierro.',
    emoji: '\u{1F34A}',
  },
  {
    id: 18,
    category: 'vitamins',
    title: 'No descuides la vitamina D',
    body: '15 minutos de sol al dia ayudan a producir vitamina D, clave para huesos fuertes y un sistema inmune sano.',
    emoji: '\u{1F34A}',
  },
  {
    id: 19,
    category: 'vitamins',
    title: 'Aprovecha las frutas de temporada',
    body: 'Las frutas y verduras de estacion son mas frescas, nutritivas y economicas. Consulta que hay disponible ahora.',
    emoji: '\u{1F34A}',
  },
  {
    id: 20,
    category: 'vitamins',
    title: 'Senales de que faltan vitaminas',
    body: 'Cansancio constante, unas fragiles o labios agrietados pueden indicar deficiencias. Una dieta variada es la solucion.',
    emoji: '\u{1F34A}',
  },

  // ---------------------------------------------------------------------------
  // PORTIONS (5)
  // ---------------------------------------------------------------------------
  {
    id: 21,
    category: 'portions',
    title: 'Usa tu mano para medir porciones',
    body: 'Palma = proteina, puno = carbohidratos, pulgar = grasas, dos manos juntas = verduras. Sencillo y sin bascula.',
    emoji: '\u{1F37D}\u{FE0F}',
  },
  {
    id: 22,
    category: 'portions',
    title: 'Divide tu plato en tres partes',
    body: 'Medio plato de verduras, un cuarto de proteina y un cuarto de carbohidratos. Es una formula equilibrada y visual.',
    emoji: '\u{1F37D}\u{FE0F}',
  },
  {
    id: 23,
    category: 'portions',
    title: 'Sirvete y guarda el resto',
    body: 'Pon la porcion en un plato y guarda la olla. Comer directo de la fuente lleva a consumir mas de lo planeado.',
    emoji: '\u{1F37D}\u{FE0F}',
  },
  {
    id: 24,
    category: 'portions',
    title: 'En restaurantes, planifica tu porcion',
    body: 'Las porciones de restaurante suelen ser el doble. Pide para llevar la mitad o comparte un plato grande.',
    emoji: '\u{1F37D}\u{FE0F}',
  },
  {
    id: 25,
    category: 'portions',
    title: 'Porciona tus snacks con anticipacion',
    body: 'Divide los snacks en bolsas o recipientes individuales. Evita comer del paquete grande para controlar cantidades.',
    emoji: '\u{1F37D}\u{FE0F}',
  },

  // ---------------------------------------------------------------------------
  // TIMING (5)
  // ---------------------------------------------------------------------------
  {
    id: 26,
    category: 'timing',
    title: 'Come cada 3-5 horas',
    body: 'Espaciar tus comidas mantiene estables los niveles de energia y evita llegar con hambre extrema a la siguiente.',
    emoji: '\u{23F0}',
  },
  {
    id: 27,
    category: 'timing',
    title: 'Combustible antes de entrenar',
    body: 'Un snack con carbohidratos 1-2 horas antes del ejercicio mejora tu rendimiento. Una fruta o tostada funciona bien.',
    emoji: '\u{23F0}',
  },
  {
    id: 28,
    category: 'timing',
    title: 'Recuperate despues del ejercicio',
    body: 'Combina proteina y carbohidratos dentro de las 2 horas post-entreno para reponer energia y reparar musculos.',
    emoji: '\u{23F0}',
  },
  {
    id: 29,
    category: 'timing',
    title: 'Cenar tarde no te hace subir de peso',
    body: 'Lo que importa es el total calorico del dia, no la hora exacta. Elige cenas ligeras si te sientes pesado de noche.',
    emoji: '\u{23F0}',
  },
  {
    id: 30,
    category: 'timing',
    title: 'El desayuno es opcional, no obligatorio',
    body: 'Si no tienes hambre temprano, esta bien. Lo esencial es cumplir tus metas de calorias y nutrientes durante el dia.',
    emoji: '\u{23F0}',
  },

  // ---------------------------------------------------------------------------
  // HABITS (5)
  // ---------------------------------------------------------------------------
  {
    id: 31,
    category: 'habits',
    title: 'Prepara comida para la semana',
    body: 'Dedica 1-2 horas el fin de semana a cocinar en lote. Tendras opciones saludables listas cuando no haya tiempo.',
    emoji: '\u{2705}',
  },
  {
    id: 32,
    category: 'habits',
    title: 'Haz la lista antes de ir al super',
    body: 'Comprar con lista reduce compras impulsivas y alimentos ultraprocesados. Planifica tus comidas y anota lo necesario.',
    emoji: '\u{2705}',
  },
  {
    id: 33,
    category: 'habits',
    title: 'Aprende a leer las etiquetas',
    body: 'Revisa la porcion, calorias, azucar agregada y sodio. Lo mas importante no siempre esta en la parte frontal.',
    emoji: '\u{2705}',
  },
  {
    id: 34,
    category: 'habits',
    title: 'Cocinar en casa te da el control',
    body: 'Cocinar permite elegir ingredientes, porciones y metodos de coccion. No tiene que ser complicado: lo simple funciona.',
    emoji: '\u{2705}',
  },
  {
    id: 35,
    category: 'habits',
    title: 'Registra lo que comes, sin juzgarte',
    body: 'Llevar un diario de comidas aumenta la consciencia alimentaria. No es para culparte, es para conocerte mejor.',
    emoji: '\u{2705}',
  },

  // ---------------------------------------------------------------------------
  // MINDFUL (5)
  // ---------------------------------------------------------------------------
  {
    id: 36,
    category: 'mindful',
    title: 'Come despacio: disfruta cada bocado',
    body: 'Tu cerebro tarda unos 20 minutos en registrar saciedad. Comer mas lento te ayuda a sentirte satisfecho con menos.',
    emoji: '\u{1F9D8}',
  },
  {
    id: 37,
    category: 'mindful',
    title: 'Hambre real vs. hambre emocional',
    body: 'El hambre real crece gradualmente y acepta varios alimentos. La emocional es repentina y busca algo especifico.',
    emoji: '\u{1F9D8}',
  },
  {
    id: 38,
    category: 'mindful',
    title: 'Identifica tus emociones al comer',
    body: 'Antes de comer, preguntate: tengo hambre o estoy aburrido, estresado o triste? Reconocerlo es el primer paso.',
    emoji: '\u{1F9D8}',
  },
  {
    id: 39,
    category: 'mindful',
    title: 'Escucha las senales de tu cuerpo',
    body: 'No necesitas terminar todo el plato. Cuando sientas satisfaccion (no llenura extrema), puedes detenerte.',
    emoji: '\u{1F9D8}',
  },
  {
    id: 40,
    category: 'mindful',
    title: 'Come sin pantallas de vez en cuando',
    body: 'Comer viendo el celular o la TV reduce la atencion a la comida y puede llevar a comer en exceso sin notarlo.',
    emoji: '\u{1F9D8}',
  },

  // ---------------------------------------------------------------------------
  // EXERCISE (5)
  // ---------------------------------------------------------------------------
  {
    id: 41,
    category: 'exercise',
    title: 'Come algo ligero antes de entrenar',
    body: 'Una fruta, unas galletas integrales o un yogur 1 hora antes te daran la energia que necesitas para rendir mejor.',
    emoji: '\u{1F3CB}\u{FE0F}',
  },
  {
    id: 42,
    category: 'exercise',
    title: 'Proteina + carbohidratos post-entreno',
    body: 'Despues de entrenar, tu cuerpo necesita reparar musculos y reponer glucogeno. Combina ambos macros para recuperarte.',
    emoji: '\u{1F3CB}\u{FE0F}',
  },
  {
    id: 43,
    category: 'exercise',
    title: 'Hidratate durante el ejercicio',
    body: 'Bebe 150-250 ml de agua cada 15-20 minutos durante actividad fisica. La deshidratacion reduce tu rendimiento.',
    emoji: '\u{1F3CB}\u{FE0F}',
  },
  {
    id: 44,
    category: 'exercise',
    title: 'No necesitas suplementos caros',
    body: 'Con una alimentacion variada puedes cubrir tus necesidades. Los suplementos ayudan, pero no reemplazan la comida real.',
    emoji: '\u{1F3CB}\u{FE0F}',
  },
  {
    id: 45,
    category: 'exercise',
    title: 'Los dias de descanso tambien importan',
    body: 'En dias de descanso, mantén tu proteina alta para la recuperacion pero puedes reducir un poco los carbohidratos.',
    emoji: '\u{1F3CB}\u{FE0F}',
  },

  // ---------------------------------------------------------------------------
  // SLEEP (5)
  // ---------------------------------------------------------------------------
  {
    id: 46,
    category: 'sleep',
    title: 'Dormir poco aumenta el apetito',
    body: 'La falta de sueno eleva la grelina (hormona del hambre) y reduce la leptina. Dormir 7-9 horas ayuda a controlar.',
    emoji: '\u{1F31C}',
  },
  {
    id: 47,
    category: 'sleep',
    title: 'Cena ligero para dormir mejor',
    body: 'Evita comidas pesadas o muy grasosas 2-3 horas antes de dormir. Un yogur o fruta son buenas opciones nocturnas.',
    emoji: '\u{1F31C}',
  },
  {
    id: 48,
    category: 'sleep',
    title: 'Alimentos que ayudan a dormir',
    body: 'Platano, avena, leche tibia y nueces contienen triptofano y magnesio que favorecen la relajacion y el descanso.',
    emoji: '\u{1F31C}',
  },
  {
    id: 49,
    category: 'sleep',
    title: 'Corta la cafeina a las 2 PM',
    body: 'La cafeina tiene una vida media de 5-6 horas. Evita cafe, te negro y bebidas energeticas por la tarde-noche.',
    emoji: '\u{1F31C}',
  },
  {
    id: 50,
    category: 'sleep',
    title: 'Sincroniza comidas con tu reloj interno',
    body: 'Comer a horarios regulares refuerza tu ritmo circadiano. Esto mejora la calidad del sueno y el metabolismo.',
    emoji: '\u{1F31C}',
  },
];
