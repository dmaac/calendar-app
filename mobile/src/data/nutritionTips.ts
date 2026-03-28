/**
 * nutritionTips.ts — 100 science-backed nutrition tips for Fitsi AI
 * Organized by category with scientific source references.
 * Max 120 characters per tip text.
 */

export type TipCategory =
  | 'protein'
  | 'hydration'
  | 'micronutrients'
  | 'meal_timing'
  | 'healthy_snacks';

export interface NutritionTip {
  id: string;
  text: string;
  category: TipCategory;
  source: string;
}

export const nutritionTips: NutritionTip[] = [
  // ─── Protein Tips (20) ──────────────────────────────────────────────────────
  {
    id: 'tip-p01',
    text: 'Consume 1.6-2.2g de proteina por kg de peso corporal para maximizar la sintesis muscular.',
    category: 'protein',
    source: 'British Journal of Sports Medicine, 2018',
  },
  {
    id: 'tip-p02',
    text: 'Distribuye tu proteina en 3-4 comidas al dia para mejor absorcion y sintesis muscular.',
    category: 'protein',
    source: 'Journal of the International Society of Sports Nutrition, 2017',
  },
  {
    id: 'tip-p03',
    text: 'La leucina es el aminoacido clave para activar la sintesis de proteina muscular.',
    category: 'protein',
    source: 'The Journal of Nutrition, 2006',
  },
  {
    id: 'tip-p04',
    text: '20-40g de proteina por comida es el rango optimo para estimular la sintesis muscular.',
    category: 'protein',
    source: 'Journal of the American Dietetic Association, 2009',
  },
  {
    id: 'tip-p05',
    text: 'Las proteinas de origen animal tienen un perfil de aminoacidos mas completo que las vegetales.',
    category: 'protein',
    source: 'Nutrients, 2019',
  },
  {
    id: 'tip-p06',
    text: 'Combinar legumbres con cereales (arroz + porotos) crea una proteina completa.',
    category: 'protein',
    source: 'The American Journal of Clinical Nutrition, 1994',
  },
  {
    id: 'tip-p07',
    text: 'El suero de leche (whey) se absorbe mas rapido que la caseina, ideal post-entrenamiento.',
    category: 'protein',
    source: 'Journal of the American College of Nutrition, 2007',
  },
  {
    id: 'tip-p08',
    text: 'Mayor consumo de proteina ayuda a preservar masa muscular durante deficit calorico.',
    category: 'protein',
    source: 'The American Journal of Clinical Nutrition, 2016',
  },
  {
    id: 'tip-p09',
    text: 'Los huevos contienen todos los aminoacidos esenciales y tienen alta biodisponibilidad.',
    category: 'protein',
    source: 'Nutrients, 2015',
  },
  {
    id: 'tip-p10',
    text: 'La proteina tiene mayor efecto termico que carbohidratos o grasas (20-30% vs 5-10%).',
    category: 'protein',
    source: 'Nutrition & Metabolism, 2004',
  },
  {
    id: 'tip-p11',
    text: 'El consumo de proteina antes de dormir estimula la recuperacion muscular nocturna.',
    category: 'protein',
    source: 'Medicine & Science in Sports & Exercise, 2012',
  },
  {
    id: 'tip-p12',
    text: 'Las personas mayores necesitan mas proteina por comida (~40g) para igual respuesta anabolica.',
    category: 'protein',
    source: 'The American Journal of Clinical Nutrition, 2015',
  },
  {
    id: 'tip-p13',
    text: 'La soja es la proteina vegetal con mayor contenido de leucina y valor biologico.',
    category: 'protein',
    source: 'Journal of Agricultural and Food Chemistry, 2012',
  },
  {
    id: 'tip-p14',
    text: 'Consumir proteina con cada comida aumenta la saciedad y reduce el hambre entre comidas.',
    category: 'protein',
    source: 'The American Journal of Clinical Nutrition, 2005',
  },
  {
    id: 'tip-p15',
    text: 'El pollo y pavo son fuentes magras de proteina con bajo contenido de grasa saturada.',
    category: 'protein',
    source: 'Nutrition Reviews, 2015',
  },
  {
    id: 'tip-p16',
    text: 'Los pescados grasos aportan proteina mas omega-3, una combinacion ideal para la salud.',
    category: 'protein',
    source: 'The American Journal of Clinical Nutrition, 2011',
  },
  {
    id: 'tip-p17',
    text: 'El yogur griego tiene el doble de proteina que el yogur regular por porcion.',
    category: 'protein',
    source: 'Journal of Dairy Science, 2013',
  },
  {
    id: 'tip-p18',
    text: 'La creatina complementa la proteina para maximizar ganancia de fuerza y masa muscular.',
    category: 'protein',
    source: 'Journal of the International Society of Sports Nutrition, 2017',
  },
  {
    id: 'tip-p19',
    text: 'Dietas altas en proteina no danan los rinones en personas con funcion renal normal.',
    category: 'protein',
    source: 'The Journal of Nutrition, 2018',
  },
  {
    id: 'tip-p20',
    text: 'Las legumbres son una fuente economica de proteina con alto contenido de fibra.',
    category: 'protein',
    source: 'Nutrients, 2017',
  },

  // ─── Hydration Tips (20) ────────────────────────────────────────────────────
  {
    id: 'tip-h01',
    text: 'Bebe 30-35ml de agua por kg de peso corporal como base diaria minima.',
    category: 'hydration',
    source: 'European Journal of Clinical Nutrition, 2010',
  },
  {
    id: 'tip-h02',
    text: 'Una perdida de solo 2% del peso corporal en agua reduce el rendimiento fisico y mental.',
    category: 'hydration',
    source: 'Medicine & Science in Sports & Exercise, 2007',
  },
  {
    id: 'tip-h03',
    text: 'Beber agua antes de las comidas puede ayudar a reducir la ingesta calorica total.',
    category: 'hydration',
    source: 'Obesity, 2010',
  },
  {
    id: 'tip-h04',
    text: 'El color de tu orina indica hidratacion: amarillo claro es buena senal.',
    category: 'hydration',
    source: 'European Journal of Clinical Nutrition, 2003',
  },
  {
    id: 'tip-h05',
    text: 'Durante ejercicio intenso, bebe 150-250ml cada 15-20 minutos.',
    category: 'hydration',
    source: 'Journal of the American College of Sports Medicine, 2007',
  },
  {
    id: 'tip-h06',
    text: 'Frutas como sandia, naranja y pepino contribuyen significativamente a tu hidratacion.',
    category: 'hydration',
    source: 'The American Journal of Clinical Nutrition, 2013',
  },
  {
    id: 'tip-h07',
    text: 'El cafe en cantidades moderadas (3-4 tazas) no causa deshidratacion significativa.',
    category: 'hydration',
    source: 'PLOS ONE, 2014',
  },
  {
    id: 'tip-h08',
    text: 'Despues de ejercicio, repone 150% del peso perdido en sudor para rehidratarte.',
    category: 'hydration',
    source: 'British Journal of Sports Medicine, 1996',
  },
  {
    id: 'tip-h09',
    text: 'La sed es un indicador tardio: cuando la sientes ya puedes estar 1-2% deshidratado.',
    category: 'hydration',
    source: 'The Journal of Physiology, 2005',
  },
  {
    id: 'tip-h10',
    text: 'Bebidas con electrolitos son necesarias solo en ejercicios de mas de 60 minutos.',
    category: 'hydration',
    source: 'Journal of the International Society of Sports Nutrition, 2006',
  },
  {
    id: 'tip-h11',
    text: 'El agua fria se absorbe mas rapido que el agua a temperatura ambiente durante ejercicio.',
    category: 'hydration',
    source: 'International Journal of Clinical and Experimental Medicine, 2013',
  },
  {
    id: 'tip-h12',
    text: 'La deshidratacion leve afecta la concentracion, el animo y la memoria a corto plazo.',
    category: 'hydration',
    source: 'The Journal of Nutrition, 2012',
  },
  {
    id: 'tip-h13',
    text: 'Beber agua ayuda al metabolismo: 500ml puede aumentar el gasto energetico un 30%.',
    category: 'hydration',
    source: 'The Journal of Clinical Endocrinology & Metabolism, 2003',
  },
  {
    id: 'tip-h14',
    text: 'En climas calidos o en altura, tus necesidades de agua aumentan significativamente.',
    category: 'hydration',
    source: 'Wilderness & Environmental Medicine, 2006',
  },
  {
    id: 'tip-h15',
    text: 'El agua con gas hidrata igual que el agua sin gas, sin efectos negativos en la salud.',
    category: 'hydration',
    source: 'European Journal of Gastroenterology & Hepatology, 2002',
  },
  {
    id: 'tip-h16',
    text: 'Los infantes y adultos mayores son mas susceptibles a la deshidratacion. Vigila su ingesta.',
    category: 'hydration',
    source: 'Nutrition Reviews, 2010',
  },
  {
    id: 'tip-h17',
    text: 'Beber agua al despertar ayuda a activar el metabolismo despues del ayuno nocturno.',
    category: 'hydration',
    source: 'The Journal of Clinical Endocrinology & Metabolism, 2003',
  },
  {
    id: 'tip-h18',
    text: 'La leche tiene mejor indice de hidratacion que el agua debido a su contenido de sodio.',
    category: 'hydration',
    source: 'The American Journal of Clinical Nutrition, 2016',
  },
  {
    id: 'tip-h19',
    text: 'Llevar una botella reutilizable aumenta el consumo de agua diario en promedio un 25%.',
    category: 'hydration',
    source: 'Journal of the Academy of Nutrition and Dietetics, 2016',
  },
  {
    id: 'tip-h20',
    text: 'La hiperhidratacion (beber en exceso) puede ser peligrosa. No fuerces mas de lo necesario.',
    category: 'hydration',
    source: 'Clinical Journal of the American Society of Nephrology, 2007',
  },

  // ─── Micronutrient Tips (20) ────────────────────────────────────────────────
  {
    id: 'tip-m01',
    text: 'La vitamina D es clave para huesos fuertes. Exponerte al sol 15 min al dia ayuda.',
    category: 'micronutrients',
    source: 'The New England Journal of Medicine, 2007',
  },
  {
    id: 'tip-m02',
    text: 'El hierro de origen animal (hemo) se absorbe 2-3 veces mejor que el de origen vegetal.',
    category: 'micronutrients',
    source: 'The American Journal of Clinical Nutrition, 2003',
  },
  {
    id: 'tip-m03',
    text: 'La vitamina C mejora la absorcion de hierro vegetal. Combina legumbres con citricos.',
    category: 'micronutrients',
    source: 'The American Journal of Clinical Nutrition, 2000',
  },
  {
    id: 'tip-m04',
    text: 'El magnesio participa en mas de 300 reacciones enzimaticas. Nueces y semillas son ricos.',
    category: 'micronutrients',
    source: 'Physiological Reviews, 2015',
  },
  {
    id: 'tip-m05',
    text: 'El zinc es esencial para la inmunidad. Carnes, mariscos y semillas de zapallo son fuentes.',
    category: 'micronutrients',
    source: 'Advances in Nutrition, 2013',
  },
  {
    id: 'tip-m06',
    text: 'La vitamina B12 solo se encuentra naturalmente en alimentos de origen animal.',
    category: 'micronutrients',
    source: 'Nutrients, 2012',
  },
  {
    id: 'tip-m07',
    text: 'El calcio necesita vitamina D para absorberse correctamente. Ambos son esenciales juntos.',
    category: 'micronutrients',
    source: 'The Journal of Clinical Endocrinology & Metabolism, 2011',
  },
  {
    id: 'tip-m08',
    text: 'Los antioxidantes de frutas y verduras coloridas protegen tus celulas del dano oxidativo.',
    category: 'micronutrients',
    source: 'Free Radical Biology and Medicine, 2012',
  },
  {
    id: 'tip-m09',
    text: 'El potasio ayuda a regular la presion arterial. Platanos, papas y espinacas son ricos.',
    category: 'micronutrients',
    source: 'The American Journal of Clinical Nutrition, 2013',
  },
  {
    id: 'tip-m10',
    text: 'El omega-3 reduce inflamacion y apoya la salud cardiovascular. Consume pescado 2x/semana.',
    category: 'micronutrients',
    source: 'Circulation, 2002',
  },
  {
    id: 'tip-m11',
    text: 'El acido folico es critico en el embarazo. Verduras de hoja verde son la mejor fuente.',
    category: 'micronutrients',
    source: 'The Lancet, 2001',
  },
  {
    id: 'tip-m12',
    text: 'La fibra alimentaria reduce el riesgo de enfermedades cardiacas. Meta: 25-30g diarios.',
    category: 'micronutrients',
    source: 'The Lancet, 2019',
  },
  {
    id: 'tip-m13',
    text: 'El selenio es un poderoso antioxidante. Dos nueces de Brasil al dia cubren el RDA.',
    category: 'micronutrients',
    source: 'The American Journal of Clinical Nutrition, 2003',
  },
  {
    id: 'tip-m14',
    text: 'El yodo es esencial para la funcion tiroidea. La sal yodada es la fuente mas comun.',
    category: 'micronutrients',
    source: 'Thyroid, 2011',
  },
  {
    id: 'tip-m15',
    text: 'La vitamina A mantiene la vision y la piel. Zanahoria, zapallo y batata son ricos.',
    category: 'micronutrients',
    source: 'The Journal of Nutrition, 2001',
  },
  {
    id: 'tip-m16',
    text: 'La vitamina K es clave para la coagulacion. Las verduras de hoja verde son la fuente.',
    category: 'micronutrients',
    source: 'Advances in Nutrition, 2012',
  },
  {
    id: 'tip-m17',
    text: 'El cromo ayuda a regular la glucosa en sangre. Brocoli y avena son buenas fuentes.',
    category: 'micronutrients',
    source: 'Diabetes Technology & Therapeutics, 2006',
  },
  {
    id: 'tip-m18',
    text: 'El exceso de vitaminas liposolubles (A, D, E, K) puede ser toxico. No excedas el RDA.',
    category: 'micronutrients',
    source: 'The American Journal of Clinical Nutrition, 2007',
  },
  {
    id: 'tip-m19',
    text: 'Las vitaminas del complejo B son esenciales para el metabolismo energetico celular.',
    category: 'micronutrients',
    source: 'Nutrients, 2016',
  },
  {
    id: 'tip-m20',
    text: 'El cobre y el zinc compiten por absorcion. Suplementar uno en exceso puede afectar al otro.',
    category: 'micronutrients',
    source: 'The Journal of Nutrition, 2000',
  },

  // ─── Meal Timing Tips (20) ──────────────────────────────────────────────────
  {
    id: 'tip-t01',
    text: 'Comer proteina dentro de 2 horas post-ejercicio optimiza la recuperacion muscular.',
    category: 'meal_timing',
    source: 'Journal of the International Society of Sports Nutrition, 2017',
  },
  {
    id: 'tip-t02',
    text: 'El desayuno no es obligatorio. Lo importante es cumplir tus calorias y macros diarios.',
    category: 'meal_timing',
    source: 'The American Journal of Clinical Nutrition, 2014',
  },
  {
    id: 'tip-t03',
    text: 'El ayuno intermitente 16:8 puede ayudar a reducir grasa sin perder masa muscular.',
    category: 'meal_timing',
    source: 'Translational Research, 2014',
  },
  {
    id: 'tip-t04',
    text: 'Comer carbohidratos 2-3 horas antes del ejercicio mejora el rendimiento deportivo.',
    category: 'meal_timing',
    source: 'Journal of the American Dietetic Association, 2009',
  },
  {
    id: 'tip-t05',
    text: 'Cenar tarde no engorda por si solo. El total calorico diario es lo que importa.',
    category: 'meal_timing',
    source: 'Nutrients, 2015',
  },
  {
    id: 'tip-t06',
    text: 'Distribuir comidas cada 3-5 horas ayuda a mantener niveles estables de energia.',
    category: 'meal_timing',
    source: 'The British Journal of Nutrition, 2010',
  },
  {
    id: 'tip-t07',
    text: 'La ventana anabolica post-ejercicio es mas amplia de lo que se creia: dura varias horas.',
    category: 'meal_timing',
    source: 'Journal of the International Society of Sports Nutrition, 2013',
  },
  {
    id: 'tip-t08',
    text: 'Comer despacio (20+ min por comida) mejora la saciedad y reduce el consumo total.',
    category: 'meal_timing',
    source: 'Journal of the Academy of Nutrition and Dietetics, 2014',
  },
  {
    id: 'tip-t09',
    text: 'Un snack con proteina antes de dormir puede mejorar la sintesis de proteina nocturna.',
    category: 'meal_timing',
    source: 'Nutrients, 2016',
  },
  {
    id: 'tip-t10',
    text: 'Entrenar en ayunas puede aumentar la oxidacion de grasas, pero no la perdida de grasa total.',
    category: 'meal_timing',
    source: 'Journal of the International Society of Sports Nutrition, 2014',
  },
  {
    id: 'tip-t11',
    text: 'El ritmo circadiano sugiere que tu cuerpo procesa mejor los carbohidratos por la manana.',
    category: 'meal_timing',
    source: 'Current Biology, 2013',
  },
  {
    id: 'tip-t12',
    text: 'Para ganancia muscular, comer en superavit calorico es mas importante que el timing exacto.',
    category: 'meal_timing',
    source: 'Sports Medicine, 2014',
  },
  {
    id: 'tip-t13',
    text: 'Hacer 3 o 6 comidas al dia no afecta el metabolismo. Elige lo que se adapte a tu rutina.',
    category: 'meal_timing',
    source: 'The British Journal of Nutrition, 2010',
  },
  {
    id: 'tip-t14',
    text: 'La cafeina 30-60 minutos antes del ejercicio mejora rendimiento y oxidacion de grasa.',
    category: 'meal_timing',
    source: 'Journal of the International Society of Sports Nutrition, 2021',
  },
  {
    id: 'tip-t15',
    text: 'Evita comidas pesadas 1-2 horas antes de entrenar para evitar molestias digestivas.',
    category: 'meal_timing',
    source: 'International Journal of Sport Nutrition and Exercise Metabolism, 2006',
  },
  {
    id: 'tip-t16',
    text: 'Comer a horarios regulares puede mejorar la sensibilidad a la insulina.',
    category: 'meal_timing',
    source: 'Proceedings of the Nutrition Society, 2016',
  },
  {
    id: 'tip-t17',
    text: 'Planificar tus comidas semanalmente reduce la probabilidad de comer ultraprocesados.',
    category: 'meal_timing',
    source: 'International Journal of Behavioral Nutrition and Physical Activity, 2017',
  },
  {
    id: 'tip-t18',
    text: 'Comer la mayor porcion de calorias temprano se asocia con mejor manejo de peso.',
    category: 'meal_timing',
    source: 'International Journal of Obesity, 2013',
  },
  {
    id: 'tip-t19',
    text: 'Carbohidratos post-ejercicio reponen glucogeno muscular y aceleran la recuperacion.',
    category: 'meal_timing',
    source: 'Journal of Applied Physiology, 1988',
  },
  {
    id: 'tip-t20',
    text: 'La consistencia en horarios de comida es mas beneficiosa que cualquier patron especifico.',
    category: 'meal_timing',
    source: 'Proceedings of the Nutrition Society, 2016',
  },

  // ─── Healthy Snacks Tips (20) ───────────────────────────────────────────────
  {
    id: 'tip-s01',
    text: 'Un punado de almendras (30g) aporta 6g de proteina, grasas saludables y vitamina E.',
    category: 'healthy_snacks',
    source: 'The Journal of Nutrition, 2015',
  },
  {
    id: 'tip-s02',
    text: 'El queso cottage con frutas es un snack alto en proteina y bajo en grasa.',
    category: 'healthy_snacks',
    source: 'The British Journal of Nutrition, 2015',
  },
  {
    id: 'tip-s03',
    text: 'Las zanahorias con hummus combinan fibra, proteina y grasas saludables en un snack.',
    category: 'healthy_snacks',
    source: 'Nutrients, 2016',
  },
  {
    id: 'tip-s04',
    text: 'Un huevo duro es un snack portatil con 6g de proteina y solo 70 calorias.',
    category: 'healthy_snacks',
    source: 'Nutrients, 2015',
  },
  {
    id: 'tip-s05',
    text: 'Las frutas deshidratadas son nutritivas pero densas en calorias. Controla la porcion.',
    category: 'healthy_snacks',
    source: 'Journal of the Academy of Nutrition and Dietetics, 2016',
  },
  {
    id: 'tip-s06',
    text: 'El edamame es un snack vegetal con 11g de proteina por porcion de 100g.',
    category: 'healthy_snacks',
    source: 'Journal of Agricultural and Food Chemistry, 2012',
  },
  {
    id: 'tip-s07',
    text: 'Las palomitas de maiz sin mantequilla son un snack integral bajo en calorias.',
    category: 'healthy_snacks',
    source: 'Journal of the American Dietetic Association, 2012',
  },
  {
    id: 'tip-s08',
    text: 'Una manzana con mantequilla de mani combina fibra, proteina y grasas saludables.',
    category: 'healthy_snacks',
    source: 'The British Journal of Nutrition, 2013',
  },
  {
    id: 'tip-s09',
    text: 'El chocolate oscuro (70%+) en moderacion aporta antioxidantes y mejora el animo.',
    category: 'healthy_snacks',
    source: 'Antioxidants & Redox Signaling, 2011',
  },
  {
    id: 'tip-s10',
    text: 'Las semillas de zapallo son ricas en magnesio, zinc y acidos grasos omega-3.',
    category: 'healthy_snacks',
    source: 'Pharmacognosy Reviews, 2012',
  },
  {
    id: 'tip-s11',
    text: 'Los garbanzos asados con especias son un snack crujiente rico en fibra y proteina.',
    category: 'healthy_snacks',
    source: 'Food Chemistry, 2009',
  },
  {
    id: 'tip-s12',
    text: 'El yogur natural con berries aporta probioticos, proteina y antioxidantes.',
    category: 'healthy_snacks',
    source: 'The American Journal of Clinical Nutrition, 2014',
  },
  {
    id: 'tip-s13',
    text: 'Los datiles medjool son un endulzante natural rico en fibra, potasio y magnesio.',
    category: 'healthy_snacks',
    source: 'Journal of Food Science and Technology, 2014',
  },
  {
    id: 'tip-s14',
    text: 'Las tostadas de arroz con aguacate son un snack rapido con grasas mono-insaturadas.',
    category: 'healthy_snacks',
    source: 'Nutrients, 2018',
  },
  {
    id: 'tip-s15',
    text: 'El apio con queso crema es un snack bajo en calorias que satisface el hambre.',
    category: 'healthy_snacks',
    source: 'Appetite, 2013',
  },
  {
    id: 'tip-s16',
    text: 'Las nueces de Brasil son la mejor fuente natural de selenio. Dos al dia son suficientes.',
    category: 'healthy_snacks',
    source: 'The American Journal of Clinical Nutrition, 2008',
  },
  {
    id: 'tip-s17',
    text: 'Los batidos verdes (espinaca, banana, leche) son una forma facil de aumentar nutrientes.',
    category: 'healthy_snacks',
    source: 'Journal of the Academy of Nutrition and Dietetics, 2015',
  },
  {
    id: 'tip-s18',
    text: 'Los frutos secos mixtos son un snack energetico ideal para llevar. Porcion: 30g.',
    category: 'healthy_snacks',
    source: 'The New England Journal of Medicine, 2013',
  },
  {
    id: 'tip-s19',
    text: 'Las barritas de proteina caseras son mas saludables que las comerciales ultraprocesadas.',
    category: 'healthy_snacks',
    source: 'Nutrients, 2019',
  },
  {
    id: 'tip-s20',
    text: 'Prepara snacks saludables con anticipacion para evitar opciones poco nutritivas.',
    category: 'healthy_snacks',
    source: 'International Journal of Behavioral Nutrition and Physical Activity, 2017',
  },
];
