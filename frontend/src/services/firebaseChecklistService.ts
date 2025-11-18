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
} from "firebase/firestore"
import { db } from "@/lib/firebase"

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

// --- 경로 헬퍼 ---
const manualsCol = collection(db, "manuals")
const manualDoc = (manualId: string) => doc(manualsCol, manualId)
const manualItemsCol = (manualId: string) =>
  collection(db, "manuals", manualId, "items")

// --- 매뉴얼 upsert (없으면 생성) ---
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

// --- 아이템 생성 ---
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

// --- 아이템 완료 토글 ---
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

// --- 아이템 삭제 ---
export async function deleteChecklistItem(manualId: string, itemId: string) {
  await deleteDoc(doc(manualItemsCol(manualId), itemId))
}

// --- 특정 매뉴얼 아이템 실시간 구독 ---
export function listenManualItems(
  manualId: string,
  callback: (items: ChecklistItem[]) => void,
) {
  const q = query(manualItemsCol(manualId), orderBy("createdAt", "asc"))
  return onSnapshot(q, (snap) => {
    const items: ChecklistItem[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<ChecklistItem, "id">),
    }))
    callback(items)
  })
}

// --- 최초 마이그레이션(선택): 초기 아이템을 한번에 넣고 싶을 때 ---
export async function seedManual(
  manual: ManualChecklist,
  items: Omit<ChecklistItem, "id" | "createdAt">[],
) {
  await upsertManual(manual)
  // 이미 존재하는지 체크 없이 단순 추가: 필요하면 중복 방지 로직 추가
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
