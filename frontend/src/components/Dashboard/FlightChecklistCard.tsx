import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Typography } from "@/components/Common/Typography"
import {
  Plane,
  Clock,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Save,
} from "lucide-react"

interface ChecklistItem {
  id: string
  title: string
  description?: string
  category: string
  check_type: string
  is_required: boolean
  checked: boolean
}

interface FlightChecklistCardProps {
  checkType: string
  items: ChecklistItem[]
  onItemCheck?: (id: string, checked: boolean) => void
  onReset?: () => void
  onSave?: () => void
}

export function FlightChecklistCard({
  checkType,
  items,
  onItemCheck,
  onReset,
  onSave,
}: FlightChecklistCardProps) {
  const [localItems, setLocalItems] = useState<ChecklistItem[]>(items)

  const handleCheckboxChange = (id: string, checked: boolean) => {
    setLocalItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked } : item)),
    )
    onItemCheck?.(id, checked)
  }

  const handleReset = () => {
    setLocalItems((prev) => prev.map((item) => ({ ...item, checked: false })))
    onReset?.()
  }

  const getCheckTypeIcon = (checkType: string) => {
    switch (checkType) {
      case "비행전":
        return <Plane className="h-4 w-4" />
      case "비행후":
        return <Clock className="h-4 w-4" />
      case "이상증상":
        return <AlertTriangle className="h-4 w-4" />
      default:
        return <Plane className="h-4 w-4" />
    }
  }

  const getCheckTypeColor = (checkType: string) => {
    switch (checkType) {
      case "비행전":
        return "bg-purple-100 text-purple-800"
      case "비행후":
        return "bg-indigo-100 text-indigo-800"
      case "이상증상":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "구호":
        return "bg-blue-100 text-blue-800"
      case "점검위치":
        return "bg-green-100 text-green-800"
      case "내용":
        return "bg-orange-100 text-orange-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getProgressPercentage = () => {
    const checkedCount = localItems.filter((item) => item.checked).length
    return Math.round((checkedCount / localItems.length) * 100)
  }

  const progressPercentage = getProgressPercentage()
  const isCompleted = progressPercentage === 100

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {getCheckTypeIcon(checkType)}
            {checkType} 체크리스트
            <Badge variant="outline" className={getCheckTypeColor(checkType)}>
              {localItems.length}개
            </Badge>
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RefreshCw className="mr-2 h-4 w-4" />
              초기화
            </Button>
            <Button variant="outline" size="sm" onClick={onSave}>
              <Save className="mr-2 h-4 w-4" />
              저장
            </Button>
          </div>
        </div>
        <CardDescription>
          진행률: {localItems.filter((item) => item.checked).length} /{" "}
          {localItems.length} ({progressPercentage}%)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* 진행률 바 */}
        <div className="mb-4">
          <div className="h-2 w-full rounded-full bg-gray-200">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                isCompleted ? "bg-green-500" : "bg-blue-500"
              }`}
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
        </div>

        {/* 체크리스트 항목들 */}
        <div className="space-y-3">
          {localItems.length > 0 ? (
            localItems.map((item) => (
              <div
                key={item.id}
                className={`flex items-center space-x-3 rounded-lg border p-3 transition-colors ${
                  item.checked
                    ? "border-green-200 bg-green-50"
                    : "hover:bg-gray-50"
                }`}
              >
                <Checkbox
                  id={item.id}
                  checked={item.checked}
                  onCheckedChange={(checked) =>
                    handleCheckboxChange(item.id, checked as boolean)
                  }
                />
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <Typography
                      variant="p"
                      className={`font-medium ${item.checked ? "text-gray-500 line-through" : ""}`}
                    >
                      {item.title}
                    </Typography>
                    <Badge className={getCategoryColor(item.category)}>
                      {item.category}
                    </Badge>
                    {item.is_required && (
                      <Badge variant="destructive" className="text-xs">
                        필수
                      </Badge>
                    )}
                  </div>
                  {item.description && (
                    <Typography
                      variant="p"
                      className={`text-sm ${item.checked ? "text-gray-400" : "text-muted-foreground"}`}
                    >
                      {item.description}
                    </Typography>
                  )}
                </div>
                {item.checked && (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                )}
              </div>
            ))
          ) : (
            <div className="text-muted-foreground py-8 text-center">
              <Typography variant="p">
                등록된 {checkType} 체크리스트가 없습니다.
              </Typography>
            </div>
          )}
        </div>

        {/* 완료 메시지 */}
        {isCompleted && localItems.length > 0 && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3">
            <div className="flex items-center gap-2 text-green-800">
              <CheckCircle className="h-5 w-5" />
              <Typography variant="p" className="font-medium">
                모든 {checkType} 체크리스트가 완료되었습니다! ✨
              </Typography>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
