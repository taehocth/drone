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
} from "lucide-react"

// ✅ PDF 관련 라이브러리
import html2canvas from "html2canvas"

export function FlightChecklistDashboard() {
  // 1) 매뉴얼 메타(로컬 정의)
  const manualMetas: ManualChecklist[] = useMemo(
    () => [
      {
        id: "operation",
        title: "비행 전 체크리스트",
        description: "드론 비행 전 안전 점검 및 사전 준비 절차",
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
        id: "flight",
        title: "비행 중 체크리스트",
        description: "드론 비행 중 실시간 모니터링 및 조작 절차",
        categories: [
          "1. 기체 상태 확인",
          "2. 비행경로 확인",
          "3. 통신 상태 확인",
          "4. 물품 투하",
        ],
      },
      {
        id: "post-flight",
        title: "비행 후 체크리스트",
        description: "드론 비행 후 안전 점검 및 정리 절차",
        categories: ["1. 배터리", "2. 기체 점검"],
      },
      {
        id: "regular-maintenance",
        title: "상시 점검 체크리스트",
        description: "드론 상시 점검 및 일상적 유지보수 절차",
        categories: ["1. Main body 점검", "2. Arm 점검"],
      },
      {
        id: "periodic-maintenance",
        title: "정기 점검 체크리스트",
        description: "드론 정기 점검 및 종합 유지보수 절차",
        categories: ["1. Main body 점검", "2. Arm 점검", "3. 비행점검"],
      },
    ],
    [],
  )

  // 2) Firestore 실시간 아이템
  const [itemsByManual, setItemsByManual] = useState<
    Record<string, ChecklistItem[]>
  >({})
  const [loadingByManual, setLoadingByManual] = useState<
    Record<string, boolean>
  >({})
  const [errorByManual, setErrorByManual] = useState<Record<string, string>>({})

  // 카테고리 접힘 상태
  const [collapsedCategories, setCollapsedCategories] = useState<
    Record<string, boolean>
  >({})

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
          const unsub = listenManualItems(meta.id, (rawItems) => {
            const safe = (rawItems ?? []).map((i) => ({
              id: i.id ?? undefined,
              title: i.title ?? "",
              description: i.description ?? "",
              isCompleted: Boolean(i.isCompleted),
              isRequired: i.isRequired ?? true,
              category: i.category ?? "기타",
              createdAt: i.createdAt ?? null,
            }))
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

  // 항목 추가
  const handleAddItem = async () => {
    try {
      if (!newItem.title || !newItem.category || !newItem.manualId) return
      await createChecklistItem(newItem.manualId, {
        title: newItem.title,
        description: newItem.description || "",
        isRequired: newItem.isRequired ?? true,
        isCompleted: false,
        category: newItem.category || "기타",
      })
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

  // ✅ PDF 내보내기 핸들러 (dom-to-image-more 사용)
  const handleExportPDF_UI = async () => {
    const element = document.getElementById("pdf-area")
    if (!element) return

    const dataUrl = await domtoimage.toPng(element)
    const pdf = new jsPDF("p", "mm", "a4")
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = pdf.internal.pageSize.getHeight()

    const img = new Image()
    img.src = dataUrl
    pdf.addImage(img, "PNG", 0, 0, pdfWidth, pdfHeight)
    pdf.save("checklist.pdf")
  }

  // ======= UI =======
  return (
    <div
      id="pdf-area"
      className="space-y-4 p-4"
      style={{ backgroundColor: "#ffffff", color: "#000000" }} // ✅ 캡처 영역 색상 강제
    >
      {/* 상단: 버튼 영역 */}
      <div className="flex gap-2">
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" />
              체크리스트 추가
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>새 체크리스트 추가</DialogTitle>
            </DialogHeader>

            {/* ✅ 추가 입력 폼 전체 복구 */}
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

        {/* ✅ PDF 저장 버튼 */}
        <Button
          onClick={handleExportPDF_UI}
          className="bg-green-600 hover:bg-green-700"
        >
          PDF 저장
        </Button>
      </div>

      {/* 리스트 영역 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {manualMetas.map((meta) => {
          const items = itemsByManual[meta.id] || []
          const status = getCompletionStatus(items)
          const grouped = groupItemsByCategory(items)

          return (
            <Card
              key={meta.id}
              className="border-2 transition-shadow hover:shadow-lg"
            >
              <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">{meta.title}</CardTitle>
                    <CardDescription className="mt-1">
                      {meta.description ?? ""}
                    </CardDescription>
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
                    <div className="text-muted-foreground text-sm">
                      항목이 없습니다. 상단의 ‘체크리스트 추가’로 만들어 보세요.
                    </div>
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
                              className="flex w-full items-center justify-between bg-gray-50 p-3 hover:bg-gray-100"
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
                              <div className="space-y-2 bg-white p-3">
                                {catItems.map((item) => {
                                  const itemId = item.id ?? `${meta.id}-temp`
                                  const done = !!item.isCompleted
                                  const desc = item.description ?? ""
                                  const title = item.title ?? ""

                                  return (
                                    <div
                                      key={itemId}
                                      className={`flex items-start gap-2 rounded-lg border p-2 ${
                                        done
                                          ? "border-green-200 bg-green-50"
                                          : "border-gray-200 bg-white hover:bg-gray-50"
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
                                              ? "text-green-700 line-through"
                                              : "text-gray-900"
                                          }`}
                                        >
                                          {title}
                                        </label>
                                        {desc !== "" && (
                                          <p
                                            className={`text-sm ${
                                              done
                                                ? "text-green-600"
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
                                            handleDeleteItem(meta.id, item.id!)
                                          }
                                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
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
    </div>
  )
}
