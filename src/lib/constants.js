// סוגי עמודות נתמכים
export const COLUMN_TYPES = [
  { type: 'text', label: 'טקסט', icon: 'T' },
  { type: 'status', label: 'סטטוס', icon: '◍' },
  { type: 'date', label: 'תאריך', icon: '📅' },
  { type: 'number', label: 'מספר', icon: '#' },
  { type: 'person', label: 'אנשים', icon: '👤' },
  { type: 'checkbox', label: 'תיבת סימון', icon: '☑' },
  { type: 'tags', label: 'תגיות', icon: '🏷' },
  { type: 'phone', label: 'טלפון', icon: '☎' },
  { type: 'email', label: 'אימייל', icon: '✉' },
  { type: 'link', label: 'קישור', icon: '🔗' },
  { type: 'dropdown', label: 'בחירה', icon: '▼' },
  { type: 'timeline', label: 'ציר זמן', icon: '⇿' },
  { type: 'formula', label: 'נוסחה', icon: '∑' },
]

// תוויות ברירת מחדל לעמודת סטטוס חדשה
export const DEFAULT_STATUS_LABELS = [
  { id: 'working', label: 'בעבודה', color: '#E0A63C' },
  { id: 'stuck', label: 'תקוע', color: '#DA4A54' },
  { id: 'done', label: 'הושלם', color: '#0E9E7C' },
  { id: 'empty', label: '', color: '#c4c4c4' },
]

// תוויות ברירת מחדל לעמודת תגיות (בחירה מרובה)
export const DEFAULT_TAG_LABELS = [
  { id: 'urgent', label: 'דחוף', color: '#DA4A54' },
  { id: 'important', label: 'חשוב', color: '#E0A63C' },
  { id: 'followup', label: 'מעקב', color: '#7A5AF0' },
  { id: 'vip', label: 'VIP', color: '#0E9E7C' },
  { id: 'new', label: 'חדש', color: '#3E7BD6' },
]

// תוויות ברירת מחדל לעמודת בחירה (dropdown)
export const DEFAULT_DROPDOWN_LABELS = [
  { id: 'option1', label: 'אפשרות 1', color: '#3E7BD6' },
  { id: 'option2', label: 'אפשרות 2', color: '#0E9E7C' },
  { id: 'option3', label: 'אפשרות 3', color: '#E0A63C' },
  { id: 'option4', label: 'אפשרות 4', color: '#DA4A54' },
  { id: 'option5', label: 'אפשרות 5', color: '#7A5AF0' },
]

// תוויות כלי AI לעמודת "כלי AI בשימוש" בתבנית מעקב ההתייעלות
export const AI_TOOL_LABELS = [
  { id: 'claude', label: 'Claude', color: '#7A5AF0' },
  { id: 'chatgpt', label: 'ChatGPT', color: '#0E9E7C' },
  { id: 'copilot', label: 'Copilot', color: '#3E7BD6' },
  { id: 'gemini', label: 'Gemini', color: '#E0A63C' },
  { id: 'other', label: 'אחר', color: '#656E7B' },
]

// תצוגות בורד
export const BOARD_VIEWS = [
  { id: 'table', label: 'טבלה' },
  { id: 'kanban', label: 'קנבן' },
  { id: 'calendar', label: 'לוח שנה' },
  { id: 'gantt', label: 'גאנט' },
  { id: 'reports', label: 'דוחות' },
]

// תבניות בורד — קבוצות ועמודות מוכנות מראש
export const BOARD_TEMPLATES = [
  {
    id: 'tasks',
    name: 'ניהול משימות',
    desc: 'סטטוס, אחראי, תאריך יעד ותגיות',
    groups: ['לביצוע', 'בתהליך', 'הושלם'],
    columns: [
      { name: 'סטטוס', type: 'status' },
      { name: 'אחראי', type: 'person' },
      { name: 'תאריך יעד', type: 'date' },
      { name: 'תגיות', type: 'tags' },
    ],
  },
  {
    id: 'crm',
    name: 'ניהול לקוחות (CRM)',
    desc: 'סטטוס, איש קשר, טלפון, אימייל וערך',
    groups: ['לידים', 'בתהליך', 'לקוחות פעילים'],
    columns: [
      { name: 'סטטוס', type: 'status' },
      { name: 'איש קשר', type: 'person' },
      { name: 'טלפון', type: 'phone' },
      { name: 'אימייל', type: 'email' },
      { name: 'ערך', type: 'number' },
      { name: 'תגיות', type: 'tags' },
    ],
  },
  {
    id: 'sales',
    name: 'פייפליין מכירות',
    desc: 'שלב, אחראי, ערך עסקה ותאריך סגירה',
    groups: ['ליד חדש', 'משא ומתן', 'נסגר'],
    columns: [
      { name: 'שלב', type: 'status' },
      { name: 'אחראי', type: 'person' },
      { name: 'ערך עסקה', type: 'number' },
      { name: 'תאריך סגירה', type: 'date' },
    ],
  },
  {
    id: 'ai-efficiency',
    name: 'מעקב התייעלות AI',
    desc: 'זמן עבודה עם AI מול זמן ידני משוער, לפי כלי ואחראי (שם העמודות קובע את ההצגה בדוחות)',
    groups: ['השבוע', 'הושלם'],
    columns: [
      { name: 'כלי AI בשימוש', type: 'dropdown', labels: AI_TOOL_LABELS },
      { name: 'סטטוס', type: 'status' },
      { name: 'אחראי', type: 'person' },
      { name: 'תאריך', type: 'date' },
      { name: 'זמן עם AI (בדקות)', type: 'number', unit: 'minutes' },
      { name: 'זמן ידני משוער (בדקות)', type: 'number', unit: 'minutes' },
    ],
    // אוטומציות מובנות שנוצרות עם הבורד (column/group לפי שם, מומרים ל-id ביצירה)
    automations: [
      {
        name: 'סטטוס "הושלם" מעביר לקבוצה "הושלם"',
        trigger: { type: 'status_is', column: 'סטטוס', label_id: 'done' },
        action: { type: 'move_group', group: 'הושלם' },
      },
    ],
  },
  {
    id: 'blank',
    name: 'בורד ריק',
    desc: 'קבוצה אחת בלבד, בלי עמודות מוכנות',
    groups: ['קבוצה ראשונה'],
    columns: [],
  },
]

// מבחר צבעים לקבוצות / וורקספייסים
export const GROUP_COLORS = [
  '#3E7BD6', '#0E9E7C', '#E0A63C', '#DA4A54', '#7A5AF0',
  '#E0568F', '#8B5CF6', '#12A37F', '#0A6650', '#579BFC',
]

// תפקידים בבורד
export const BOARD_ROLES = [
  { value: 'owner', label: 'בעלים' },
  { value: 'editor', label: 'עורך' },
  { value: 'viewer', label: 'צופה' },
]

export const ORG_ROLES = [
  { value: 'admin', label: 'מנהל' },
  { value: 'member', label: 'חבר' },
]

export function roleLabel(list, value) {
  return list.find((r) => r.value === value)?.label || value
}
