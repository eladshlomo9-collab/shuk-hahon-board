// עמודת "אחראי" תומכת בכמה אנשים: value = { user_ids: [...] }.
// עדיין קוראים גם את הצורה הישנה { user_id } (נתונים שנוצרו לפני התמיכה ברב-אחראים,
// ולא עברו את מיגרציית db/add-multi-person.sql) — כותבים תמיד בצורה החדשה בלבד.
export function getPersonIds(value) {
  if (value?.user_ids) return value.user_ids
  if (value?.user_id) return [value.user_id]
  return []
}
