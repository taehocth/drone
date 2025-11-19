// FlightChecklistDashboard.tsx
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import domtoimage from "dom-to-image-more"
import jsPDF from "jspdf"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import {
  upsertManual,
  listenManualItems,
  createChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  type ChecklistItem,
  type ManualChecklist,
} from "@/services/firebaseChecklistService"
import {
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  X,
  Edit,
  Check,
  Eye,
  EyeOff,
  Plane,
  Settings,
  FileText,
  Target,
  Shield,
  BarChart3,
  Save,
  Download,
} from "lucide-react"

// 확장된 ManualChecklist 타입
type ExtendedManualChecklist = ManualChecklist & {
  icon: any
  color: "blue" | "green" | "orange" | "purple" | "red"
}

export function FlightChecklistDashboard() {
  // 1) 매뉴얼 메타(로컬 정의)
  const manualMetas: ExtendedManualChecklist[] = useMemo(
    () => [
      {
        id: "operation",
        title: "비행 전 체크리스트",
        description: "드론 비행 전 안전 점검 및 사전 준비 절차",
        icon: Plane,
        color: "blue",
        categories: [
          "1. 배터리 점검",
          "2. 조종기 점검",
          "3. Main Body 점검",
          "4. Arm 점검",
          "5. 통신 상태 점검",
          "6. GCS 미션 경로 점검",
          "7. 배터리 연결 후 최종 점검",
        ],
      },
      {
        id: "post-flight",
        title: "비행 후 체크리스트",
        description: "드론 비행 후 안전 점검 및 정리 절차",
        icon: Target,
        color: "orange",
        categories: ["1. 배터리", "2. 기체 점검"],
      },
      {
        id: "regular-maintenance",
        title: "물품 점검 체크리스트",
        description: "드론 물품 점검",
        icon: Settings,
        color: "purple",
        categories: ["1. 노트북", "2. 배터리", "3.조종기", "4.기타"],
      },
      {
        id: "periodic-maintenance",
        title: "정기 점검 체크리스트",
        description: "드론 정기 점검 및 종합 유지보수 절차",
        icon: Shield,
        color: "red",
        categories: ["1. Main body 점검", "2. Arm 점검", "3. 비행점검"],
      },
    ],
    [],
  )

  // 중앙화된 기본 구조 제공 함수
  const getDefaultStructureFor = (
    manualId: string,
  ): Record<string, string[]> | null => {
    if (manualId === "operation") {
      return {
        "배터리 점검": [
          "기체 배터리 상태 점검",
          "조종기 배터리 점검",
          "배터리 케이스 점검 (배터리 흔들림)",
        ],
        "조종기 점검": ["기체 전원 인가 전 조종기 전원 on", "유선 조종기 확인"],
        "Main Body 점검": [
          "Main Frame (카울 크랙 점검)",
          "LTE, RFD 안테나 연결 및 전장품 고정 상태 점검",
          "카메라 고정 상태 점검",
          "Landing Gear 고정 상태 및 크랙 점검",
          "그리퍼 고정 및 전원 점검",
        ],
        "통신 상태 점검": [
          "LTE 연결 및 발열 확인",
          "RFD 연결 확인",
          "카메라 연결 확인",
          "GPS 상태 확인 (위성 개수 30 이상)",
          "K-DRIMS 연결 확인",
        ],
        "Arm 점검": [
          "Arm Frame 크랙 점검",
          "모터 고정 상태 점검",
          "프로펠러 고정 상태 및 크랙 점검",
          "모터/ESC 작동 상태 및 회전 방향 점검",
          "Arm 폴딩 부분 나사 점검",
        ],
        "GCS 미션 경로 점검": [
          "배송거점 이륙 및 착륙 위치 점검",
          "배달점 위치 점검",
          "대기 모드 설정 여부 점검",
          "전체 비행 고도 점검",
          "기체 Yaw 고정 점검",
        ],
        "배터리 연결 후 최종 점검": [
          "GCS 상 기체 위치 오차 및 기수 방향 점검",
          "비행 경로 최종 확인 및 업로드",
          "비행 모드 점검",
          "그리퍼 잠금 및 배송품 상태 확인",
          "비행 전 수평 캘리브레이션",
        ],
      }
    }

    if (manualId === "post-flight") {
      return {
        "배터리 점검": [
          "배터리 잔량 체크",
          "기체 전원 케이블 분리",
          "배터리 사이클 표기",
        ],
        "기체 점검": [
          "Main Frame 크랙 점검",
          "Arm Frame 크랙 점검",
          "Landing Gear 고정 상태 및 크랙 점검",
          "프로펠러 고정 상태 및 크랙 점검",
          "모터 고정 상태 점검",
          "그리퍼 서보 전원 공급선 연결 점검",
          "LTE 발열 점검",
          "식별장치 전원 off",
          "비행 로그 기록 확인",
        ],
      }
    }

    if (manualId === "regular-maintenance") {
      return {
        조종기: ["무선 조종기", "유선 조종기"],
        배터리: [
          "P900 배터리 ",
          "반고체 배터리 최소 2세트 (4팩)",
          "배터리 충전기",
          "셀 체커기",
        ],
        노트북: ["노트북 배터리 상태 확인", "운영 소프트웨어 버전 확인"],
        기타: [
          "보령시 휴대폰",
          "인터콤",
          "배송물품 보호팩, 공기 주입기",
          "예비 기체",
        ],
      }
    }

    if (manualId === "periodic-maintenance") {
      return {
        "주요 부품 교체 주기 점검": [
          "모터 교체 주기 확인",
          "프로펠러 마모 점검",
        ],
        "펌웨어 및 설정 확인": [
          "펌웨어 최신화 확인",
          "설정 백업 및 복원 가능 여부 확인",
        ],
      }
    }

    return null
  }

  // 2) Firestore 실시간 아이템
  const [itemsByManual, setItemsByManual] = useState<
    Record<string, ChecklistItem[]>
  >({})

  // 3) 통계 계산
  const stats = useMemo(() => {
    const totalItems = Object.values(itemsByManual).reduce(
      (sum, items) => sum + items.length,
      0,
    )
    const completedItems = Object.values(itemsByManual).reduce(
      (sum, items) => sum + items.filter((item) => item.isCompleted).length,
      0,
    )
    const completionRate =
      totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0
    return { totalItems, completedItems, completionRate }
  }, [itemsByManual])
  const [loadingByManual, setLoadingByManual] = useState<
    Record<string, boolean>
  >({})
  const [errorByManual, setErrorByManual] = useState<Record<string, string>>({})

  // 3) 저장된 체크리스트 관리
  const [savedChecklists, setSavedChecklists] = useState<
    Array<{
      id: string
      title: string
      timestamp: string
      lastModified?: string
      items: Record<string, ChecklistItem[]>
    }>
  >([])
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(
    null,
  )
  const [collapsedSavedChecklists, setCollapsedSavedChecklists] = useState<
    Record<string, boolean>
  >({})
  const [isSavedChecklistsVisible, setIsSavedChecklistsVisible] = useState(true)

  // 카테고리 접힘 상태
  const [collapsedCategories, setCollapsedCategories] = useState<
    Record<string, boolean>
  >({})

  // 로컬 세션에서 사용자가 폴백 항목을 숨기기 위한 상태
  // 구조: { [manualId]: { [categoryLabel]: { [title]: true } } }
  const [hiddenFallbacks, setHiddenFallbacks] = useState<
    Record<string, Record<string, Record<string, boolean>>>
  >({})

  const hideFallbackItem = (
    manualId: string,
    category: string,
    title: string,
  ) => {
    setHiddenFallbacks((prev) => {
      const next = { ...(prev || {}) }
      next[manualId] = { ...(next[manualId] || {}) }
      next[manualId][category] = { ...(next[manualId][category] || {}) }
      next[manualId][category][title] = true
      return next
    })
  }

  // 추가 다이얼로그 상태
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newItem, setNewItem] = useState({
    title: "",
    description: "",
    category: "",
    manualId: "",
    isRequired: true,
  })

  // 3) 최초 마운트: 매뉴얼 upsert + 각 매뉴얼 구독
  useEffect(() => {
    const unsubs: Array<() => void> = []

    ;(async () => {
      for (const meta of manualMetas) {
        try {
          setLoadingByManual((p) => ({ ...p, [meta.id]: true }))
          await upsertManual(meta)
          const unsub = listenManualItems(meta.id, async (rawItems) => {
            const safe = (rawItems ?? []).map((i) => ({
              id: i.id ?? undefined,
              title: i.title ?? "",
              description: i.description ?? "",
              isCompleted: Boolean(i.isCompleted),
              isRequired: i.isRequired ?? true,
              category: i.category ?? "기타",
              createdAt: i.createdAt ?? null,
            }))
            // 빈 스냅샷인 경우: 이제 시드 로직은 훅(useFlightChecklist)에서 관리합니다.
            // 여기서는 별도의 자동 시드를 수행하지 않습니다.
            setItemsByManual((prev) => ({ ...prev, [meta.id]: safe }))
            setLoadingByManual((p) => ({ ...p, [meta.id]: false }))
          })
          unsubs.push(unsub)
        } catch (e: any) {
          console.error(`listen/upsert fail: ${meta.id}`, e)
          setErrorByManual((p) => ({ ...p, [meta.id]: e?.message ?? "error" }))
          setLoadingByManual((p) => ({ ...p, [meta.id]: false }))
        }
      }
    })()

    return () => unsubs.forEach((u) => u())
  }, [manualMetas])

  // 체크박스 토글
  const handleCheckboxChange = async (
    manualId: string,
    itemId: string,
    checked: boolean,
  ) => {
    try {
      await toggleChecklistItem(manualId, itemId, checked)
    } catch (e) {
      console.error("toggleChecklistItem error", e)
    }
  }

  // 폴백 항목 클릭 시 실제 Firestore에 항목을 생성해서 영구화합니다.
  // 이렇게 하면 폴백 항목도 체크/해제하면 DB에 반영되어 다음 로드에 유지됩니다.
  const handleCreateFallbackItem = async (
    manualId: string,
    title: string,
    category: string,
    checked: boolean,
  ) => {
    try {
      const existing = itemsByManual[manualId] || []
      const defaultStructure = getDefaultStructureFor(manualId)

      // If there are no real items in Firestore yet and we have a default structure,
      // seed the entire default set for this manual at once. Mark the clicked
      // item as completed if requested so UI reflects the user's action and
      // the remaining items remain visible.
      if (existing.length === 0 && defaultStructure) {
        const meta = manualMetas.find((m) => m.id === manualId)
        const ops: Promise<void>[] = []
        for (const [catBase, subItems] of Object.entries(defaultStructure)) {
          const label =
            meta?.categories?.find((d) => d.includes(catBase)) || catBase
          for (const t of subItems) {
            ops.push(
              createChecklistItem(manualId, {
                title: t,
                description: "",
                isRequired: true,
                isCompleted: t === title ? !!checked : false,
                category: label,
              }),
            )
          }
        }
        await Promise.all(ops)
        return
      }

      // If there are existing items but this specific category is empty,
      // seed only that category's default items so the rest of the manual isn't affected.
      if (existing.length > 0 && defaultStructure) {
        const hasCategoryItems = (existing || []).some(
          (it) => (it.category || "") === category,
        )
        if (!hasCategoryItems) {
          const meta = manualMetas.find((m) => m.id === manualId)
          const strip = (s: string) => s.replace(/^[\d.\s]+/, "")
          const catStripped = strip(category)
          const matchKey = Object.keys(defaultStructure).find(
            (k) =>
              category.includes(k) ||
              k.includes(catStripped) ||
              catStripped.includes(k),
          )
          if (matchKey) {
            const subItems = defaultStructure[matchKey]
            const label =
              meta?.categories?.find((d) => d.includes(matchKey)) || category
            const ops: Promise<void>[] = []
            for (const t of subItems) {
              ops.push(
                createChecklistItem(manualId, {
                  title: t,
                  description: "",
                  isRequired: true,
                  isCompleted: t === title ? !!checked : false,
                  category: label,
                }),
              )
            }
            await Promise.all(ops)
            return
          }
        }
      }

      // Fallback: create only the clicked item
      await createChecklistItem(manualId, {
        title,
        description: "",
        isRequired: true,
        isCompleted: !!checked,
        category: category || "기타",
      })
      // listenManualItems 구독이 있으므로 스냅샷이 업데이트되어 UI에 반영됩니다.
    } catch (e) {
      console.error("createFallbackItem error", e)
    }
  }

  // 항목 추가
  const handleAddItem = async () => {
    try {
      if (!newItem.title || !newItem.category || !newItem.manualId) return

      // Firestore에 새 항목 추가
      await createChecklistItem(newItem.manualId, {
        title: newItem.title,
        description: newItem.description || "",
        isRequired: newItem.isRequired ?? true,
        isCompleted: false,
        category: newItem.category || "기타",
      })

      // 저장된 체크리스트에도 자동으로 반영
      const newItemForSaved: ChecklistItem = {
        title: newItem.title,
        description: newItem.description || "",
        isRequired: newItem.isRequired ?? true,
        isCompleted: false,
        category: newItem.category || "기타",
        createdAt: new Date().toISOString(),
      }

      setSavedChecklists((prev) =>
        prev.map((checklist) => {
          const updatedItems = { ...checklist.items }
          if (!updatedItems[newItem.manualId]) {
            updatedItems[newItem.manualId] = []
          }

          updatedItems[newItem.manualId] = [
            ...updatedItems[newItem.manualId],
            newItemForSaved,
          ]

          return {
            ...checklist,
            items: updatedItems,
            lastModified: new Date().toLocaleString("ko-KR"),
          }
        }),
      )

      setNewItem({
        title: "",
        description: "",
        category: "",
        manualId: "",
        isRequired: true,
      })
      setIsAddDialogOpen(false)
    } catch (e) {
      console.error("createChecklistItem error", e)
    }
  }

  // 항목 삭제
  const handleDeleteItem = async (manualId: string, itemId: string) => {
    try {
      await deleteChecklistItem(manualId, itemId)
    } catch (e) {
      console.error("deleteChecklistItem error", e)
    }
  }

  // 유틸
  const groupItemsByCategory = (items: ChecklistItem[]) =>
    (items ?? []).reduce<Record<string, ChecklistItem[]>>((acc, item) => {
      const c = item.category || "기타"
      ;(acc[c] ||= []).push(item)
      return acc
    }, {})

  const getCompletionStatus = (items: ChecklistItem[]) => {
    const list = items ?? []
    const completedCount = list.filter((i) => !!i.isCompleted).length
    const totalCount = list.length
    const requiredCompletedCount = list.filter(
      (i) => !!i.isRequired && !!i.isCompleted,
    ).length
    const requiredTotalCount = list.filter((i) => !!i.isRequired).length
    return {
      completedCount,
      totalCount,
      requiredCompletedCount,
      requiredTotalCount,
      isAllCompleted: totalCount > 0 && completedCount === totalCount,
      isAllRequiredCompleted:
        requiredTotalCount > 0 && requiredCompletedCount === requiredTotalCount,
    }
  }

  const toggleCategory = (c: string) =>
    setCollapsedCategories((prev) => ({ ...prev, [c]: !prev[c] }))

  const toggleSavedChecklist = (checklistId: string) =>
    setCollapsedSavedChecklists((prev) => ({
      ...prev,
      [checklistId]: !prev[checklistId],
    }))

  // PDF 내보내기 핸들러
  // PDF 내보내기 핸들러 (자동 페이지 분할 버전)
  const handleExportPDF = async () => {
    const element = document.getElementById("pdf-area")
    if (!element) return

    const pdf = new jsPDF("p", "mm", "a4")
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = pdf.internal.pageSize.getHeight()

    // 브라우저 px 단위를 mm로 변환 (A4 높이 = 약 1122px)
    const pageHeightPx = (pdfHeight * 96) / 25.4
    const totalHeight = element.scrollHeight
    let positionY = 0
    let pageIndex = 0

    // ✅ 페이지 단위로 여러 번 캡처
    while (positionY < totalHeight) {
      const dataUrl = await domtoimage.toPng(element, {
        quality: 1,
        bgcolor: "#ffffff",
        width: element.scrollWidth,
        height: pageHeightPx,
        style: {
          transform: `translateY(-${positionY}px)`,
          transformOrigin: "top left",
        },
      })

      if (pageIndex > 0) pdf.addPage()
      pdf.addImage(dataUrl, "PNG", 0, 0, pdfWidth, pdfHeight)

      positionY += pageHeightPx
      pageIndex++
    }

    // 파일 저장
    const now = new Date()
    const fileName = `Flight_Checklist_${now.getFullYear()}${String(
      now.getMonth() + 1,
    ).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.pdf`
    pdf.save(fileName)
  }

  // ===== 저장 핸들러 수정본 =====
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false)
  const [saveTitle, setSaveTitle] = useState("")

  const handleSaveChecklist = () => {
    setIsSaveDialogOpen(true) // 제목 입력 다이얼로그 열기
  }

  const confirmSaveChecklist = () => {
    const timestamp = new Date().toLocaleString("ko-KR")
    const title = saveTitle.trim() || `체크리스트 저장 - ${timestamp}`

    const itemsToSave: Record<string, ChecklistItem[]> = {}
    for (const meta of manualMetas) {
      const existing = itemsByManual[meta.id] || []
      const safeItems = existing.map((item) => ({
        ...item,
        isCompleted: item.isCompleted, // ✅ 모든 체크 초기화
      }))
      itemsToSave[meta.id] = safeItems
    }

    const newSavedChecklist = {
      id: Date.now().toString(),
      title,
      timestamp,
      items: itemsToSave,
    }

    setSavedChecklists((prev) => [newSavedChecklist, ...prev])
    setSaveTitle("")
    setIsSaveDialogOpen(false)
  }

  // 저장된 체크리스트 삭제 핸들러
  const handleDeleteSavedChecklist = (id: string) => {
    setSavedChecklists((prev) =>
      prev.filter((checklist) => checklist.id !== id),
    )
  }

  // 저장된 체크리스트 수정 모드 토글
  const handleToggleEditMode = (id: string) => {
    setEditingChecklistId(editingChecklistId === id ? null : id)
  }

  // 저장된 체크리스트 항목 토글
  const handleToggleSavedItem = (
    checklistId: string,
    itemId: string,
    manualId: string,
  ) => {
    setSavedChecklists((prev) =>
      prev.map((checklist) => {
        if (checklist.id === checklistId) {
          const updatedItems = { ...checklist.items }
          if (updatedItems[manualId]) {
            updatedItems[manualId] = updatedItems[manualId].map((item) =>
              item.id === itemId
                ? { ...item, isCompleted: !item.isCompleted }
                : item,
            )
          }
          return {
            ...checklist,
            items: updatedItems,
            lastModified: new Date().toLocaleString("ko-KR"),
          }
        }
        return checklist
      }),
    )
  }

  // 저장된 체크리스트에서 항목 삭제
  const handleDeleteItemFromSavedChecklist = (
    checklistId: string,
    itemId: string,
    manualId: string,
  ) => {
    setSavedChecklists((prev) =>
      prev.map((checklist) => {
        if (checklist.id === checklistId) {
          const updatedItems = { ...checklist.items }
          if (updatedItems[manualId]) {
            updatedItems[manualId] = updatedItems[manualId].filter(
              (item) => item.id !== itemId,
            )
          }

          return {
            ...checklist,
            items: updatedItems,
            lastModified: new Date().toLocaleString("ko-KR"),
          }
        }
        return checklist
      }),
    )
  }

  // 저장된 체크리스트 PDF 내보내기
  const handleExportSavedChecklistPDF = async (checklistId: string) => {
    const element = document.getElementById(`saved-checklist-${checklistId}`)
    if (!element) return

    // 원본 스타일 백업
    const originalStyle = element.style.cssText
    const originalClasses = element.className

    // PDF용 임시 스타일 적용
    element.style.backgroundColor = "#ffffff"
    element.style.color = "#000000"
    element.style.padding = "20px"
    element.style.boxShadow = "none"
    element.style.outline = "none"

    // PDF 전용 클래스 추가
    element.classList.add("pdf-export")

    // 모든 자식 요소의 스타일도 백업하고 수정
    const allElements = element.querySelectorAll("*")
    const originalStyles: { [key: string]: string } = {}

    // ✅ 모든 테두리 완전 제거 (Tailwind 내부 스타일 포함)
    allElements.forEach((el) => {
      const element = el as HTMLElement
      const computed = window.getComputedStyle(element)

      if (computed.borderWidth !== "0px") {
        element.style.border = "none"
      }
      if (computed.boxShadow !== "none") {
        element.style.boxShadow = "none"
      }
      if (computed.backgroundClip === "border-box") {
        element.style.backgroundClip = "padding-box"
      }
      // ✅ Tailwind 기본 border-color 제거
      element.style.borderColor = "transparent !important"
      element.style.borderWidth = "0 !important"
      element.style.borderStyle = "none !important"

      // ✅ border-left/right/top/bottom 개별 제거
      element.style.borderLeft = "none"
      element.style.borderRight = "none"
      element.style.borderTop = "none"
      element.style.borderBottom = "none"

      // ✅ 회색 배경 잔상 제거
      if (
        computed.backgroundColor &&
        computed.backgroundColor !== "rgba(0, 0, 0, 0)"
      ) {
        const bg = computed.backgroundColor
        // 그라디언트나 흐린 색이면 흰색으로 강제 덮어씌움
        if (bg.includes("rgb") && bg.match(/\d+/g)?.[0] !== "255") {
          element.style.backgroundColor = "#ffffff"
        }
      }
      // 카드형 컨테이너의 잔여 테두리 제거
      if (
        element.className.includes("Card") ||
        element.className.includes("border") ||
        element.className.includes("shadow")
      ) {
        element.style.backgroundColor = "#ffffff"
        element.style.border = "none"
        element.style.boxShadow = "none"
      }
    })

    try {
      const dataUrl = await domtoimage.toPng(element, {
        quality: 1.0,
        bgcolor: "#ffffff",
        width: element.offsetWidth,
        height: element.offsetHeight,
        style: {
          transform: "scale(1)",
          transformOrigin: "top left",
        },
      })

      const pdf = new jsPDF("p", "mm", "a4")
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()

      // 현재 날짜로 제목 생성
      const now = new Date()
      const year = now.getFullYear()
      const month = now.getMonth() + 1
      const day = now.getDate()
      const title = `Saved Flight Checklist - ${year}/${month}/${day}`

      // PDF에 제목 추가
      pdf.setFontSize(16)
      pdf.setFont("helvetica", "bold")
      pdf.text(title, pdfWidth / 2, 20, { align: "center" })

      // 이미지 추가 (제목 아래에)
      const img = new Image()
      img.src = dataUrl
      pdf.addImage(img, "PNG", 0, 30, pdfWidth, pdfHeight - 30)

      // 파일명도 날짜 포함
      const fileName = `Saved_Flight_Checklist_${year}${month}${day}_${checklistId}.pdf`
      pdf.save(fileName)
    } finally {
      // 모든 스타일 복원
      element.style.cssText = originalStyle
      element.className = originalClasses
      element.classList.remove("pdf-export")

      allElements.forEach((el, index) => {
        const element = el as HTMLElement
        element.style.cssText = originalStyles[index] || ""
      })
    }
  }

  // 저장된 체크리스트 수정 완료
  const handleSaveEdit = () => {
    setEditingChecklistId(null)
  }

  // ======= UI =======
  return (
    <div id="pdf-area" className="space-y-6 p-4">
      {/* 메인 헤더 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              비행 체크리스트 대시보드
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              드론 비행 전후 안전 점검 및 유지보수 체크리스트를 관리하세요
            </p>
          </div>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-blue-500 p-2">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    전체 항목
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {stats.totalItems}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500 bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-500 p-2">
                  <CheckCircle className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    완료된 항목
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {stats.completedItems}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500 bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-purple-500 p-2">
                  <BarChart3 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    완료율
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {stats.completionRate}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 상단: 버튼 영역 */}
      <div className="flex flex-wrap gap-2">
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button
              className="bg-indigo-600 text-white transition-all duration-200 hover:scale-105 hover:bg-indigo-700"
              title="새로운 체크리스트 항목을 추가합니다"
            >
              <Plus className="mr-2 h-4 w-4" />
              체크리스트 추가
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>새 체크리스트 추가</DialogTitle>
            </DialogHeader>

            <div className="grid gap-3 py-3">
              {/* Manual 선택 */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">매뉴얼</label>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={newItem.manualId}
                  onChange={(e) =>
                    setNewItem((p) => ({ ...p, manualId: e.target.value }))
                  }
                >
                  <option value="">선택하세요</option>
                  {manualMetas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Category 선택 */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">카테고리</label>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={newItem.category}
                  onChange={(e) =>
                    setNewItem((p) => ({ ...p, category: e.target.value }))
                  }
                  disabled={!newItem.manualId}
                >
                  <option value="">선택하세요</option>
                  {manualMetas
                    .find((m) => m.id === newItem.manualId)
                    ?.categories?.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                </select>
              </div>

              {/* 제목 */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">제목</label>
                <Input
                  value={newItem.title}
                  onChange={(e) =>
                    setNewItem((p) => ({ ...p, title: e.target.value }))
                  }
                  placeholder="예) 배터리 커넥터 고정 확인"
                />
              </div>

              {/* 설명 */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">설명</label>
                <Textarea
                  value={newItem.description}
                  onChange={(e) =>
                    setNewItem((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="필요 시 상세 설명"
                />
              </div>

              {/* 필수 여부 */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="required"
                  checked={newItem.isRequired}
                  onCheckedChange={(v) =>
                    setNewItem((p) => ({ ...p, isRequired: Boolean(v) }))
                  }
                />
                <label htmlFor="required" className="text-sm">
                  필수 항목
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
              >
                취소
              </Button>
              <Button
                onClick={handleAddItem}
                disabled={
                  !newItem.title || !newItem.category || !newItem.manualId
                }
              >
                추가
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 저장 버튼 */}
        {/* 저장 버튼 + 제목 입력 다이얼로그 */}
        <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={handleSaveChecklist}
              className="bg-emerald-600 text-white transition-all duration-200 hover:scale-105 hover:bg-emerald-700"
            >
              <Save className="mr-2 h-4 w-4" />
              저장
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>체크리스트 제목 입력</DialogTitle>
            </DialogHeader>
            <Input
              placeholder="예: 2025년 10월 29일 비행 전 점검"
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              className="mt-3"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsSaveDialogOpen(false)}
              >
                취소
              </Button>
              <Button
                onClick={confirmSaveChecklist}
                className="bg-emerald-600 text-white"
              >
                저장
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* PDF 저장 버튼 */}
        <Button
          onClick={handleExportPDF}
          className="bg-rose-600 text-white transition-all duration-200 hover:scale-105 hover:bg-rose-700"
          title="체크리스트를 PDF 파일로 내보냅니다"
        >
          <Download className="mr-2 h-4 w-4" />
          PDF 저장
        </Button>
      </div>

      {/* 리스트 영역 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {manualMetas.map((meta) => {
          const items = itemsByManual[meta.id] || []
          const status = getCompletionStatus(items)
          const grouped = groupItemsByCategory(items)

          const IconComponent = meta.icon
          const colorClasses = {
            blue: "from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200",
            green:
              "from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200",
            orange:
              "from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border-orange-200",
            purple:
              "from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200",
            red: "from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border-red-200",
          }

          return (
            <Card
              key={meta.id}
              className={`border-2 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${colorClasses[meta.color as keyof typeof colorClasses]}`}
            >
              <CardHeader
                className={`border-b bg-gradient-to-r ${colorClasses[meta.color as keyof typeof colorClasses]}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded-full p-2 ${
                        meta.color === "blue"
                          ? "bg-blue-500"
                          : meta.color === "green"
                            ? "bg-green-500"
                            : meta.color === "orange"
                              ? "bg-orange-500"
                              : meta.color === "purple"
                                ? "bg-purple-500"
                                : "bg-red-500"
                      }`}
                    >
                      <IconComponent className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">{meta.title}</CardTitle>
                      <CardDescription className="mt-1">
                        {meta.description ?? ""}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      {status.isAllCompleted ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : status.isAllRequiredCompleted ? (
                        <AlertTriangle className="h-5 w-5 text-yellow-600" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                      )}
                      <span className="text-sm font-medium">
                        {status.completedCount}/{status.totalCount}
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      필수: {status.requiredCompletedCount}/
                      {status.requiredTotalCount}
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-4">
                {/* 로딩/에러/빈 상태 */}
                {loadingByManual[meta.id] && (
                  <div className="text-muted-foreground text-sm">
                    불러오는 중…
                  </div>
                )}
                {errorByManual[meta.id] && (
                  <div className="text-sm text-red-600">
                    불러오기 실패: {errorByManual[meta.id]}
                  </div>
                )}
                {!loadingByManual[meta.id] &&
                  !errorByManual[meta.id] &&
                  (items.length === 0 ? (
                    meta.id === "operation" ? (
                      // 🟢 비행 전 체크리스트 기본 구조
                      <div className="space-y-3">
                        {(() => {
                          const defaultStructure: Record<string, string[]> = {
                            "배터리 점검": [
                              "기체 배터리 상태 점검",
                              "조종기 배터리 점검",
                              "배터리 케이스 점검 (배터리 흔들림)",
                            ],
                            "조종기 점검": [
                              "기체 전원 인가 전 조종기 전원 on",
                              "유선 조종기 확인",
                            ],
                            "Main Body 점검": [
                              "Main Frame (카울 크랙 점검)",
                              "LTE, RFD 안테나 연결 및 전장품 고정 상태 점검",
                              "카메라 고정 상태 점검",
                              "Landing Gear 고정 상태 및 크랙 점검",
                              "그리퍼 고정 및 전원 점검",
                            ],
                            "통신 상태 점검": [
                              "LTE 연결 및 발열 확인",
                              "RFD 연결 확인",
                              "카메라 연결 확인",
                              "GPS 상태 확인 (위성 개수 30 이상)",
                              "K-DRIMS 연결 확인",
                            ],
                            "Arm 점검": [
                              "Arm Frame 크랙 점검",
                              "모터 고정 상태 점검",
                              "프로펠러 고정 상태 및 크랙 점검",
                              "모터/ESC 작동 상태 및 회전 방향 점검",
                              "Arm 폴딩 부분 나사 점검",
                            ],
                            "GCS 미션 경로 점검": [
                              "배송거점 이륙 및 착륙 위치 점검",
                              "배달점 위치 점검",
                              "대기 모드 설정 여부 점검",
                              "전체 비행 고도 점검",
                              "기체 Yaw 고정 점검",
                            ],
                            "배터리 연결 후 최종 점검": [
                              "GCS 상 기체 위치 오차 및 기수 방향 점검",
                              "비행 경로 최종 확인 및 업로드",
                              "비행 모드 점검",
                              "그리퍼 잠금 및 배송품 상태 확인",
                              "비행 전 수평 캘리브레이션",
                            ],
                          }

                          const getLabel = (base: string) =>
                            meta.categories?.find((d) => d.includes(base)) ||
                            base

                          return Object.entries(defaultStructure).map(
                            ([catBase, subItems]) => (
                              <div
                                key={catBase}
                                className="overflow-hidden rounded-lg border"
                              >
                                <div className="flex w-full items-center justify-between bg-gray-50 p-3">
                                  <div className="flex items-center gap-3">
                                    <span className="text-base font-semibold">
                                      {getLabel(catBase)}
                                    </span>
                                    <span className="rounded-full border px-2 py-1 text-xs font-medium">
                                      {subItems.length}개
                                    </span>
                                  </div>
                                </div>
                                <div className="space-y-2 bg-white p-3">
                                  {subItems.map((title) => {
                                    if (
                                      hiddenFallbacks[meta.id] &&
                                      hiddenFallbacks[meta.id][
                                        getLabel(catBase)
                                      ] &&
                                      hiddenFallbacks[meta.id][
                                        getLabel(catBase)
                                      ][title]
                                    )
                                      return null

                                    return (
                                      <div
                                        key={title}
                                        className="flex items-start gap-2 rounded-lg border p-2"
                                      >
                                        <Checkbox
                                          id={title}
                                          checked={false}
                                          onCheckedChange={(v) =>
                                            handleCreateFallbackItem(
                                              meta.id,
                                              title,
                                              getLabel(catBase),
                                              Boolean(v),
                                            )
                                          }
                                          className="mt-1"
                                        />
                                        <div className="min-w-0 flex-1">
                                          <label className="cursor-pointer font-medium text-gray-900">
                                            {title}
                                          </label>
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            hideFallbackItem(
                                              meta.id,
                                              getLabel(catBase),
                                              title,
                                            )
                                          }
                                          className="h-6 w-6 p-0 text-red-600 hover:bg-red-50"
                                          title="숨기기"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            ),
                          )
                        })()}
                      </div>
                    ) : meta.id === "post-flight" ? (
                      // 🟠 비행 후 체크리스트 기본 구조 (operation과 동일한 스타일로 렌더링)
                      <div className="space-y-3">
                        {(() => {
                          const defaultStructure: Record<string, string[]> = {
                            "배터리 점검": [
                              "배터리 잔량 체크",
                              "기체 전원 케이블 분리",
                              "배터리 사이클 표기",
                            ],
                            "기체 점검": [
                              "Main Frame 크랙 점검",
                              "Arm Frame 크랙 점검",
                              "Landing Gear 고정 상태 및 크랙 점검",
                              "프로펠러 고정 상태 및 크랙 점검",
                              "모터 고정 상태 점검",
                              "그리퍼 서보 전원 공급선 연결 점검",
                              "LTE 발열 점검",
                              "식별장치 전원 off",
                              "비행 로그 기록 확인",
                            ],
                          }

                          const getLabel = (base: string) =>
                            meta.categories?.find((d) => d.includes(base)) ||
                            base

                          return Object.entries(defaultStructure).map(
                            ([catBase, subItems]) => (
                              <div
                                key={catBase}
                                className="overflow-hidden rounded-lg border"
                              >
                                <div className="flex w-full items-center justify-between bg-gray-50 p-3">
                                  <div className="flex items-center gap-3">
                                    <span className="text-base font-semibold">
                                      {getLabel(catBase)}
                                    </span>
                                    <span className="rounded-full border px-2 py-1 text-xs font-medium">
                                      {subItems.length}개
                                    </span>
                                  </div>
                                </div>
                                <div className="space-y-2 bg-white p-3">
                                  {subItems.map((title) => {
                                    if (
                                      hiddenFallbacks[meta.id] &&
                                      hiddenFallbacks[meta.id][
                                        getLabel(catBase)
                                      ] &&
                                      hiddenFallbacks[meta.id][
                                        getLabel(catBase)
                                      ][title]
                                    )
                                      return null

                                    return (
                                      <div
                                        key={title}
                                        className="flex items-start gap-2 rounded-lg border p-2"
                                      >
                                        <Checkbox
                                          id={`${meta.id}-${title}`}
                                          checked={false}
                                          onCheckedChange={(v) =>
                                            handleCreateFallbackItem(
                                              meta.id,
                                              title,
                                              getLabel(catBase),
                                              Boolean(v),
                                            )
                                          }
                                          className="mt-1"
                                        />
                                        <div className="min-w-0 flex-1">
                                          <label className="cursor-pointer font-medium text-gray-900">
                                            {title}
                                          </label>
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            hideFallbackItem(
                                              meta.id,
                                              getLabel(catBase),
                                              title,
                                            )
                                          }
                                          className="h-6 w-6 p-0 text-red-600 hover:bg-red-50"
                                          title="숨기기"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            ),
                          )
                        })()}
                      </div>
                    ) : meta.id === "periodic-maintenance" ? (
                      // 🔴 정기 점검 체크리스트 기본 구조
                      <div className="space-y-3">
                        {(() => {
                          const defaultStructure: Record<string, string[]> = {
                            "주요 부품 교체 주기 점검": [
                              "모터 교체 주기 확인",
                              "프로펠러 마모 점검",
                            ],
                            "펌웨어 및 설정 확인": [
                              "펌웨어 최신화 확인",
                              "설정 백업 및 복원 가능 여부 확인",
                            ],
                          }

                          const getLabel = (base: string) =>
                            meta.categories?.find((d) => d.includes(base)) ||
                            base

                          return Object.entries(defaultStructure).map(
                            ([catBase, subItems]) => (
                              <div
                                key={catBase}
                                className="overflow-hidden rounded-lg border"
                              >
                                <div className="flex w-full items-center justify-between bg-gray-50 p-3">
                                  <div className="flex items-center gap-3">
                                    <span className="text-base font-semibold">
                                      {getLabel(catBase)}
                                    </span>
                                    <span className="rounded-full border px-2 py-1 text-xs font-medium">
                                      {subItems.length}개
                                    </span>
                                  </div>
                                </div>
                                <div className="space-y-2 bg-white p-3">
                                  {subItems.map((title) => (
                                    <div
                                      key={title}
                                      className="flex items-start gap-2 rounded-lg border p-2"
                                    >
                                      <Checkbox
                                        id={`${meta.id}-${title}`}
                                        checked={false}
                                        onCheckedChange={(v) =>
                                          handleCreateFallbackItem(
                                            meta.id,
                                            title,
                                            getLabel(catBase),
                                            Boolean(v),
                                          )
                                        }
                                        className="mt-1"
                                      />
                                      <div className="min-w-0 flex-1">
                                        <label className="cursor-pointer font-medium text-gray-900">
                                          {title}
                                        </label>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ),
                          )
                        })()}
                      </div>
                    ) : (
                      <div className="text-muted-foreground text-sm">
                        항목이 없습니다. 상단의 '체크리스트 추가'로 만들어
                        보세요.
                      </div>
                    )
                  ) : (
                    <div className="space-y-3">
                      {meta.categories?.map((category) => {
                        const catItems = grouped[category] || []
                        const catStatus = getCompletionStatus(catItems)
                        const isCollapsed = !!collapsedCategories[category]

                        return (
                          <div
                            key={category}
                            className="overflow-hidden rounded-lg border"
                          >
                            <button
                              onClick={() => toggleCategory(category)}
                              className="flex w-full items-center justify-between bg-gray-50 p-3 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-base font-semibold">
                                  {category}
                                </span>
                                <span className="rounded-full border px-2 py-1 text-xs font-medium">
                                  {catStatus.completedCount}/
                                  {catStatus.totalCount}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {catStatus.isAllCompleted && (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                )}
                                {isCollapsed ? (
                                  <ChevronRight className="h-4 w-4 text-gray-500" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-gray-500" />
                                )}
                              </div>
                            </button>

                            {!isCollapsed && (
                              <div className="space-y-2 bg-white p-3 dark:bg-gray-900">
                                {catItems.length === 0
                                  ? (() => {
                                      const defaultStructure =
                                        getDefaultStructureFor(meta.id)
                                      const strip = (s: string) =>
                                        s.replace(/^[\d.\s]+/, "")
                                      const catStripped = strip(category)
                                      const matchKey =
                                        defaultStructure &&
                                        Object.keys(defaultStructure).find(
                                          (k) =>
                                            category.includes(k) ||
                                            k.includes(catStripped) ||
                                            catStripped.includes(k),
                                        )

                                      const fallbackSubItems =
                                        matchKey && defaultStructure
                                          ? defaultStructure[matchKey]
                                          : null

                                      if (!fallbackSubItems) {
                                        return (
                                          <div className="text-muted-foreground text-sm">
                                            항목이 없습니다. 상단의 '체크리스트
                                            추가'로 만들어 보세요.
                                          </div>
                                        )
                                      }

                                      return fallbackSubItems.map((title) => {
                                        if (
                                          hiddenFallbacks[meta.id] &&
                                          hiddenFallbacks[meta.id][category] &&
                                          hiddenFallbacks[meta.id][category][
                                            title
                                          ]
                                        )
                                          return null

                                        return (
                                          <div
                                            key={title}
                                            className="flex items-start gap-2 rounded-lg border p-2"
                                          >
                                            <Checkbox
                                              id={`${meta.id}-${category}-${title}`}
                                              checked={false}
                                              onCheckedChange={(v) =>
                                                handleCreateFallbackItem(
                                                  meta.id,
                                                  title,
                                                  category,
                                                  Boolean(v),
                                                )
                                              }
                                              className="mt-1"
                                            />
                                            <div className="min-w-0 flex-1">
                                              <label className="cursor-pointer font-medium text-gray-900">
                                                {title}
                                              </label>
                                            </div>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() =>
                                                hideFallbackItem(
                                                  meta.id,
                                                  category,
                                                  title,
                                                )
                                              }
                                              className="h-6 w-6 p-0 text-red-600 hover:bg-red-50"
                                              title="숨기기"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        )
                                      })
                                    })()
                                  : catItems.map((item) => {
                                      const itemId =
                                        item.id ?? `${meta.id}-temp`
                                      const done = !!item.isCompleted
                                      const desc = item.description ?? ""
                                      const title = item.title ?? ""

                                      return (
                                        <div
                                          key={itemId}
                                          className={`flex items-start gap-2 rounded-lg border p-2 ${
                                            done
                                              ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                                              : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
                                          }`}
                                        >
                                          <Checkbox
                                            id={itemId}
                                            checked={done}
                                            onCheckedChange={(checked) =>
                                              handleCheckboxChange(
                                                meta.id,
                                                itemId,
                                                Boolean(checked),
                                              )
                                            }
                                            className="mt-1"
                                          />
                                          <div className="min-w-0 flex-1">
                                            <label
                                              htmlFor={itemId}
                                              className={`cursor-pointer font-medium ${
                                                done
                                                  ? "text-green-700 line-through dark:text-green-400"
                                                  : "text-gray-900 dark:text-gray-100"
                                              }`}
                                            >
                                              {title}
                                            </label>
                                            {desc !== "" && (
                                              <p
                                                className={`text-sm ${
                                                  done
                                                    ? "text-green-600 dark:text-green-300"
                                                    : "text-muted-foreground"
                                                }`}
                                              >
                                                {desc}
                                              </p>
                                            )}
                                          </div>
                                          {item.id && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() =>
                                                handleDeleteItem(
                                                  meta.id,
                                                  item.id!,
                                                )
                                              }
                                              className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          )}
                                        </div>
                                      )
                                    })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 저장된 체크리스트 섹션 */}
      {/* 저장된 체크리스트 섹션 */}
      {savedChecklists.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
            <FileText className="text-orange-500" /> 저장된 체크리스트
            <span className="ml-2 text-sm text-gray-500">
              ({savedChecklists.length}개)
            </span>
          </h2>

          <div className="grid gap-6 lg:grid-cols-2">
            {savedChecklists.map((savedChecklist) => (
              <Card
                key={savedChecklist.id}
                id={`saved-checklist-${savedChecklist.id}`}
                className="rounded-2xl border border-orange-300 bg-gradient-to-br from-orange-50 via-amber-50 to-white shadow-md transition-all duration-300 hover:scale-[1.01] hover:shadow-xl dark:from-orange-900/10 dark:via-orange-800/10 dark:to-gray-900"
              >
                <CardHeader className="flex items-center justify-between border-b border-orange-200">
                  <div>
                    <CardTitle className="text-lg font-semibold text-orange-800 dark:text-orange-300">
                      {savedChecklist.title}
                    </CardTitle>
                    <CardDescription className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      저장: {savedChecklist.timestamp}
                      {savedChecklist.lastModified && (
                        <span className="ml-2">
                          수정: {savedChecklist.lastModified}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        handleExportSavedChecklistPDF(savedChecklist.id)
                      }
                      title="PDF 내보내기"
                      className="text-rose-600 hover:bg-rose-50"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        handleDeleteSavedChecklist(savedChecklist.id)
                      }
                      title="삭제"
                      className="text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="space-y-2 p-4">
                  {manualMetas.map((meta) => {
                    const items = savedChecklist.items[meta.id] || []
                    if (items.length === 0) return null
                    const grouped = groupItemsByCategory(items)

                    return (
                      <div
                        key={meta.id}
                        className="rounded-lg border border-orange-100 bg-white/70 p-3 dark:bg-gray-800/50"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <meta.icon className="h-4 w-4 text-orange-500" />
                          <span className="font-medium text-gray-800 dark:text-gray-200">
                            {meta.title}
                          </span>
                        </div>
                        {Object.entries(grouped).map(
                          ([category, categoryItems]) => (
                            <div key={category} className="ml-4 space-y-1">
                              <div className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                                {category}
                              </div>
                              {categoryItems.map((item) => (
                                <div
                                  key={item.id}
                                  className={`text-sm ${
                                    item.isCompleted
                                      ? "text-green-600 line-through"
                                      : "text-gray-800 dark:text-gray-100"
                                  }`}
                                >
                                  • {item.title}
                                </div>
                              ))}
                            </div>
                          ),
                        )}
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
