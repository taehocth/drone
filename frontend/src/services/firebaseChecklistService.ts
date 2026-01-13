// src/services/firebaseChecklistService.ts
import {
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Unsubscribe,
  FirestoreError,
} from "firebase/firestore"
import { db } from "@/lib/firebase"

/* =========================
 * Types
 * ========================= */
export type ChecklistItem = {
  id?: string
  title: string
  description?: string
  isCompleted: boolean
  isRequired: boolean
  category?: string
  createdAt?: any
}

export type ManualChecklist = {
  id: string // "operation" | "flight" | ...
  title: string
  description?: string
  categories?: string[]
}

/* =========================
 * Collection Helpers
 * ========================= */
const manualsCol = collection(db, "manuals")
const manualDoc = (manualId: string) => doc(manualsCol, manualId)
const manualItemsCol = (manualId: string) =>
  collection(db, "manuals", manualId, "items")

/* =========================
 * Manual (upsert)
 * ========================= */
export async function upsertManual(meta: ManualChecklist) {
  await setDoc(
    manualDoc(meta.id),
    {
      title: meta.title,
      description: meta.description ?? "",
      categories: meta.categories ?? [],
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

/* =========================
 * Checklist Item CRUD
 * ========================= */
export async function createChecklistItem(
  manualId: string,
  item: Omit<ChecklistItem, "id" | "createdAt">,
) {
  await addDoc(manualItemsCol(manualId), {
    ...item,
    isCompleted: false,
    createdAt: serverTimestamp(),
  })
}

export async function toggleChecklistItem(
  manualId: string,
  itemId: string,
  checked: boolean,
) {
  await updateDoc(doc(manualItemsCol(manualId), itemId), {
    isCompleted: checked,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteChecklistItem(manualId: string, itemId: string) {
  await deleteDoc(doc(manualItemsCol(manualId), itemId))
}

/* =========================
 * One-shot fetch (비실시간)
 * ========================= */
export async function getManualItems(manualId: string) {
  const q = query(manualItemsCol(manualId), orderBy("createdAt", "asc"))
  const snap = await getDocs(q)

  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<ChecklistItem, "id">),
  })) as ChecklistItem[]
}

/* =========================
 * Realtime listener (핵심)
 * ========================= */
export function listenManualItems(
  manualId: string,
  callback: (items: ChecklistItem[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  if (!manualId) {
    // 안전장치: 잘못된 호출 방지
    console.warn("[Firestore] listenManualItems called without manualId")
    return () => {}
  }

  const q = query(manualItemsCol(manualId), orderBy("createdAt", "asc"))

  return onSnapshot(
    q,
    (snap) => {
      const items: ChecklistItem[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ChecklistItem, "id">),
      }))
      callback(items)
    },
    (error) => {
      console.error("[Firestore listen error]", error)
      onError?.(error)
    },
  )
}

/* =========================
 * Initial Seed (선택)
 * ========================= */
export async function seedManual(
  manual: ManualChecklist,
  items: Omit<ChecklistItem, "id" | "createdAt">[],
) {
  await upsertManual(manual)

  await Promise.all(
    items.map((it) =>
      addDoc(manualItemsCol(manual.id), {
        ...it,
        isCompleted: false,
        createdAt: serverTimestamp(),
      }),
    ),
  )
}
