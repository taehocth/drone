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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Typography } from "@/components/Common/Typography"
import {
  BookOpen,
  Wrench,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react"

interface ChecklistItem {
  id: string
  title: string
  description?: string
  isCompleted: boolean
  isRequired: boolean
  category?: string // 분류 추가
}

interface ManualChecklist {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  items: ChecklistItem[]
  categories?: string[] // 분류 목록 추가
}

export function FlightChecklistDashboard() {
  const [manuals, setManuals] = useState<ManualChecklist[]>([
    {
      id: "operation",
      title: "비행 전 체크리스트",
      description: "드론 비행 전 안전 점검 및 사전 준비 절차",
      icon: <BookOpen className="h-6 w-6" />,
      categories: [
        "1. 배터리 점검",
        "2. 조종기 점검",
        "3. Main Body 점검",
        "4. Arm 점검",
        "5. 통신 상태 점검",
        "6. GCS 미션 경로 점검",
        "7. 배터리 연결 후 최종 점검",
      ],
      items: [
        // 1. 배터리 점검
        {
          id: "op-1-1",
          title: "기체 배터리 상태 점검",
          description: "기체 배터리의 충전 상태 및 전압 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. 배터리 점검",
        },
        {
          id: "op-1-2",
          title: "조종기 배터리 점검",
          description: "조종기 배터리의 충전 상태 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. 배터리 점검",
        },
        {
          id: "op-1-3",
          title: "지상 RFD 배터리 점검",
          description: "지상 RFD 배터리의 충전 상태 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. 배터리 점검",
        },
        {
          id: "op-1-4",
          title: "배터리 케이스 점검",
          description: "배터리 케이스의 손상 여부 및 고정 상태 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. 배터리 점검",
        },
        // 2. 조종기 점검
        {
          id: "op-2-1",
          title: "(기체 전원 인가 전) 조종기 켜기",
          description: "기체 전원을 켜기 전에 조종기를 먼저 켜기",
          isCompleted: false,
          isRequired: true,
          category: "2. 조종기 점검",
        },
        // 3. Main body 점검
        {
          id: "op-3-1",
          title: "Main Frame 크랙 점검",
          description: "메인 프레임의 균열이나 손상 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "3. Main Body 점검",
        },
        {
          id: "op-3-2",
          title: "LTE, RFD 안테나 연결 및 전장품 고정 상태 점검",
          description: "LTE 및 RFD 안테나 연결 상태와 전장품 고정 확인",
          isCompleted: false,
          isRequired: true,
          category: "3. Main Body 점검",
        },
        {
          id: "op-3-3",
          title: "카메라 고정 상태 점검",
          description: "카메라의 고정 상태 및 연결 확인",
          isCompleted: false,
          isRequired: true,
          category: "3. Main Body 점검",
        },
        {
          id: "op-3-4",
          title: "Landing Gear 고정 상태 및 크랙 점검",
          description: "랜딩 기어의 고정 상태와 균열 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "3. Main Body 점검",
        },
        {
          id: "op-3-5",
          title: "그리퍼 고정 및 전원 점검",
          description: "그리퍼의 고정 상태와 전원 연결 확인",
          isCompleted: false,
          isRequired: true,
          category: "3. Main Body 점검",
        },
        // 4. Arm 점검
        {
          id: "op-4-1",
          title: "Arm Frame 크랙 점검",
          description: "암 프레임의 균열이나 손상 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "4. Arm 점검",
        },
        {
          id: "op-4-2",
          title: "모터 고정 상태 점검",
          description: "모터의 고정 상태 및 나사 풀림 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "4. Arm 점검",
        },
        {
          id: "op-4-3",
          title: "프로펠러 고정 상태 및 크랙 점검",
          description: "프로펠러의 고정 상태와 균열, 손상 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "4. Arm 점검",
        },
        {
          id: "op-4-4",
          title: "모터/ESC 작동 상태 및 회전 방향 점검",
          description: "모터와 ESC의 작동 상태 및 프로펠러 회전 방향 확인",
          isCompleted: false,
          isRequired: true,
          category: "4. Arm 점검",
        },
        {
          id: "op-4-5",
          title: "Arm 폴딩 부분 나사 점검",
          description: "암 폴딩 부분의 나사 고정 상태 확인",
          isCompleted: false,
          isRequired: true,
          category: "4. Arm 점검",
        },
        // 5. 통신 상태 점검
        {
          id: "op-5-1",
          title: "LTE 연결 및 발열 확인",
          description: "LTE 모듈 연결 상태와 발열 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "5. 통신 상태 점검",
        },
        {
          id: "op-5-2",
          title: "카메라 연결 확인",
          description: "카메라와 조종기 간의 연결 상태 확인",
          isCompleted: false,
          isRequired: true,
          category: "5. 통신 상태 점검",
        },
        {
          id: "op-5-3",
          title: "RFD 연결 확인",
          description: "RFD 모듈의 연결 상태 확인",
          isCompleted: false,
          isRequired: true,
          category: "5. 통신 상태 점검",
        },
        {
          id: "op-5-4",
          title: "GPS상태 확인",
          description: "GPS 신호 수신 상태 및 위성 수 확인",
          isCompleted: false,
          isRequired: true,
          category: "5. 통신 상태 점검",
        },
        {
          id: "op-5-5",
          title: "K-DRIMS 연결 확인",
          description: "K-DRIMS 시스템 연결 상태 확인",
          isCompleted: false,
          isRequired: true,
          category: "5. 통신 상태 점검",
        },
        // 6. GCS 미션 경로 점검
        {
          id: "op-6-1",
          title: "배송 거점 이륙 및 착륙 위치 점검",
          description: "배송 거점의 이륙 및 착륙 위치 설정 확인",
          isCompleted: false,
          isRequired: true,
          category: "6. GCS 미션 경로 점검",
        },
        {
          id: "op-6-2",
          title: "배달점 위치 점검",
          description: "배달점의 정확한 위치 좌표 확인",
          isCompleted: false,
          isRequired: true,
          category: "6. GCS 미션 경로 점검",
        },
        {
          id: "op-6-3",
          title: "대기 모드 설정 여부 점검",
          description: "비행 중 대기 모드 설정 상태 확인",
          isCompleted: false,
          isRequired: true,
          category: "6. GCS 미션 경로 점검",
        },
        {
          id: "op-6-4",
          title: "전체 비행 고도 점검",
          description: "전체 비행 경로의 고도 설정 확인",
          isCompleted: false,
          isRequired: true,
          category: "6. GCS 미션 경로 점검",
        },
        {
          id: "op-6-5",
          title: "기체 Yaw 고정 점검",
          description: "기체의 Yaw 방향 고정 상태 확인",
          isCompleted: false,
          isRequired: true,
          category: "6. GCS 미션 경로 점검",
        },
        // 7. 배터리 연결 후 최종 점검
        {
          id: "op-7-1",
          title: "GCS에서 기체의 위치 오차 및 기수 방향 점검",
          description: "GCS에서 기체의 위치 오차와 기수 방향 확인",
          isCompleted: false,
          isRequired: true,
          category: "7. 배터리 연결 후 최종 점검",
        },
        {
          id: "op-7-2",
          title: "비행 경로 최종 확인 및 업로드",
          description: "비행 경로의 최종 확인 후 기체에 업로드",
          isCompleted: false,
          isRequired: true,
          category: "7. 배터리 연결 후 최종 점검",
        },
        {
          id: "op-7-3",
          title: "비행 모드 점검",
          description: "비행 모드 설정 상태 확인",
          isCompleted: false,
          isRequired: true,
          category: "7. 배터리 연결 후 최종 점검",
        },
        {
          id: "op-7-4",
          title: "그리퍼 잠금 및 배송품 상태 확인",
          description: "그리퍼 잠금 상태와 배송품 고정 상태 확인",
          isCompleted: false,
          isRequired: true,
          category: "7. 배터리 연결 후 최종 점검",
        },
        {
          id: "op-7-5",
          title: "비행 전 수평 캘리브레이션",
          description: "비행 전 기체의 수평 캘리브레이션 수행",
          isCompleted: false,
          isRequired: true,
          category: "7. 배터리 연결 후 최종 점검",
        },
      ],
    },
    {
      id: "flight",
      title: "비행 중 체크리스트",
      description: "드론 비행 중 실시간 모니터링 및 조작 절차",
      icon: <BookOpen className="h-6 w-6" />,
      categories: [
        "1. 기체 상태 확인",
        "2. 비행경로 확인",
        "3. 통신 상태 확인",
        "4. 물품 투하",
      ],
      items: [
        // 1. 기체 상태 확인
        {
          id: "fl-1-1",
          title: "기체 자세 확인",
          description:
            "기체의 롤, 피치, 요우 각도가 정상 범위 내에 있는지 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. 기체 상태 확인",
        },
        {
          id: "fl-1-2",
          title: "기체 속도 확인",
          description: "기체의 현재 비행 속도가 설정된 범위 내에 있는지 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. 기체 상태 확인",
        },
        {
          id: "fl-1-3",
          title: "기체 고도 확인",
          description: "기체의 현재 고도가 안전 범위 내에 있는지 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. 기체 상태 확인",
        },
        {
          id: "fl-1-4",
          title: "QGC 경고 메세지 확인",
          description: "QGC에서 표시되는 경고 메시지가 있는지 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. 기체 상태 확인",
        },
        // 2. 비행경로 확인
        {
          id: "fl-2-1",
          title: "업로드한 비행 경로에 따라 비행을 진행하고 있는지 확인",
          description:
            "기체가 미리 업로드한 비행 경로를 정확히 따라가고 있는지 확인",
          isCompleted: false,
          isRequired: true,
          category: "2. 비행경로 확인",
        },
        // 3. 통신 상태 확인
        {
          id: "fl-3-1",
          title: "LTE 연결 및 발열 상태 확인",
          description: "LTE 모듈의 연결 상태와 발열 여부를 실시간으로 확인",
          isCompleted: false,
          isRequired: true,
          category: "3. 통신 상태 확인",
        },
        {
          id: "fl-3-2",
          title: "카메라 연결 상태 확인",
          description: "카메라와 조종기 간의 연결 상태를 실시간으로 확인",
          isCompleted: false,
          isRequired: true,
          category: "3. 통신 상태 확인",
        },
        {
          id: "fl-3-3",
          title: "RFD 연결 상태 확인",
          description: "RFD 모듈의 연결 상태를 실시간으로 확인",
          isCompleted: false,
          isRequired: true,
          category: "3. 통신 상태 확인",
        },
        {
          id: "fl-3-4",
          title: "GPS 상태 확인",
          description: "GPS 신호 수신 상태 및 위성 수를 실시간으로 확인",
          isCompleted: false,
          isRequired: true,
          category: "3. 통신 상태 확인",
        },
        // 4. 물품 투하
        {
          id: "fl-4-1",
          title: "배달점 도착 후 대기모드 시 Position 모드로 고도 하강",
          description:
            "배달점에 도착하면 대기모드에서 Position 모드로 전환하여 고도를 하강",
          isCompleted: false,
          isRequired: true,
          category: "4. 물품 투하",
        },
        {
          id: "fl-4-2",
          title: "배달점에 물품이 닿는 경우 그리퍼 릴리즈",
          description: "배달점에 물품이 닿으면 그리퍼를 릴리즈하여 물품을 투하",
          isCompleted: false,
          isRequired: true,
          category: "4. 물품 투하",
        },
        {
          id: "fl-4-3",
          title: "배송물품 투하 후 고도 상승",
          description: "배송물품 투하 완료 후 안전한 고도로 상승",
          isCompleted: false,
          isRequired: true,
          category: "4. 물품 투하",
        },
        {
          id: "fl-4-4",
          title: "미션 재인가",
          description: "다음 배달점으로 이동하기 위해 미션을 재인가",
          isCompleted: false,
          isRequired: true,
          category: "4. 물품 투하",
        },
      ],
    },
    {
      id: "post-flight",
      title: "비행 후 체크리스트",
      description: "드론 비행 후 안전 점검 및 정리 절차",
      icon: <BookOpen className="h-6 w-6" />,
      categories: ["1. 배터리", "2. 기체 점검"],
      items: [
        // 1. 배터리
        {
          id: "pf-1-1",
          title: "기체 전원 케이블 분리",
          description: "비행 완료 후 기체 전원 케이블을 안전하게 분리",
          isCompleted: false,
          isRequired: true,
          category: "1. 배터리",
        },
        {
          id: "pf-1-2",
          title: "배터리 잔량 체크",
          description: "비행 후 배터리 잔량을 확인하고 기록",
          isCompleted: false,
          isRequired: true,
          category: "1. 배터리",
        },
        {
          id: "pf-1-3",
          title: "배터리 사이클 표기",
          description: "배터리 사용 사이클을 기록하고 관리",
          isCompleted: false,
          isRequired: true,
          category: "1. 배터리",
        },
        // 2. 기체 점검
        {
          id: "pf-2-1",
          title: "MainFrame 크랙 점검",
          description: "비행 후 메인 프레임의 균열이나 손상 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "2. 기체 점검",
        },
        {
          id: "pf-2-2",
          title: "Landing Gear 고정 상태 및 크랙 점검",
          description: "랜딩 기어의 고정 상태와 균열 여부를 비행 후 점검",
          isCompleted: false,
          isRequired: true,
          category: "2. 기체 점검",
        },
        {
          id: "pf-2-3",
          title: "프로펠러 고정 상태 및 크랙 점검",
          description: "프로펠러의 고정 상태와 균열, 손상 여부를 비행 후 점검",
          isCompleted: false,
          isRequired: true,
          category: "2. 기체 점검",
        },
        {
          id: "pf-2-4",
          title: "모터 고정상태 점검",
          description: "모터의 고정 상태 및 나사 풀림 여부를 비행 후 점검",
          isCompleted: false,
          isRequired: true,
          category: "2. 기체 점검",
        },
        {
          id: "pf-2-5",
          title: "Arm Frame 크랙 점검",
          description: "암 프레임의 균열이나 손상 여부를 비행 후 점검",
          isCompleted: false,
          isRequired: true,
          category: "2. 기체 점검",
        },
        {
          id: "pf-2-6",
          title: "그리퍼 서보 전원 공급선 연결 점검",
          description: "그리퍼 서보의 전원 공급선 연결 상태를 비행 후 점검",
          isCompleted: false,
          isRequired: true,
          category: "2. 기체 점검",
        },
        {
          id: "pf-2-7",
          title: "LTE 발열 점검",
          description: "LTE 모듈의 발열 상태를 비행 후 점검",
          isCompleted: false,
          isRequired: true,
          category: "2. 기체 점검",
        },
        {
          id: "pf-2-8",
          title: "비행로그 기록 확인",
          description: "비행 중 기록된 로그 데이터를 확인하고 저장",
          isCompleted: false,
          isRequired: true,
          category: "2. 기체 점검",
        },
      ],
    },

    {
      id: "regular-maintenance",
      title: "상시 점검 체크리스트",
      description: "드론 상시 점검 및 일상적 유지보수 절차",
      icon: <Wrench className="h-6 w-6" />,
      categories: ["1. Main body 점검", "2. Arm 점검"],
      items: [
        // 1. Main body 점검
        {
          id: "rm-1-1",
          title: "Main Frame 크랙 점검",
          description: "메인 프레임의 균열이나 손상 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. Main body 점검",
        },
        {
          id: "rm-1-2",
          title: "전장품 고정 상태 점검",
          description: "전자장비의 고정 상태 및 나사 풀림 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. Main body 점검",
        },
        {
          id: "rm-1-3",
          title: "전선 단선 여부 점검",
          description: "전선의 단선이나 손상 여부를 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. Main body 점검",
        },
        {
          id: "rm-1-4",
          title: "GNSS module 지지대 고정 상태 및 크랙 점검",
          description: "GNSS 모듈 지지대의 고정 상태와 균열 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. Main body 점검",
        },
        {
          id: "rm-1-5",
          title: "Landing Gear 고정 상태 및 크랙 점검",
          description: "랜딩 기어의 고정 상태와 균열 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. Main body 점검",
        },
        {
          id: "rm-1-6",
          title: "배송함 및 그리퍼 고정 점검",
          description: "배송함과 그리퍼의 고정 상태 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. Main body 점검",
        },
        {
          id: "rm-1-7",
          title: "배터리 케이스 고정 상태 및 크랙 점검",
          description: "배터리 케이스의 고정 상태와 균열 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. Main body 점검",
        },
        {
          id: "rm-1-8",
          title: "카메라 거치대 고정 상태 및 크랙 점검",
          description: "카메라 거치대의 고정 상태와 균열 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. Main body 점검",
        },
        {
          id: "rm-1-9",
          title: "안테나 거치대 고정 상태 및 크랙 점검",
          description: "안테나 거치대의 고정 상태와 균열 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. Main body 점검",
        },
        // 2. Arm 점검
        {
          id: "rm-2-1",
          title: "Arm Frame 크랙 점검",
          description: "암 프레임의 균열이나 손상 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "2. Arm 점검",
        },
        {
          id: "rm-2-2",
          title: "모터 고정 상태 점검",
          description: "모터의 고정 상태 및 나사 풀림 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "2. Arm 점검",
        },
        {
          id: "rm-2-3",
          title: "ESC 고정 상태 점검",
          description: "ESC의 고정 상태 및 나사 풀림 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "2. Arm 점검",
        },
        {
          id: "rm-2-4",
          title: "모터/ESC 작동 상태 및 회전 방향 점검",
          description: "모터와 ESC의 작동 상태 및 프로펠러 회전 방향 확인",
          isCompleted: false,
          isRequired: true,
          category: "2. Arm 점검",
        },
        {
          id: "rm-2-5",
          title: "전선 단선 여부 점검",
          description: "암 부분 전선의 단선이나 손상 여부를 확인",
          isCompleted: false,
          isRequired: true,
          category: "2. Arm 점검",
        },
        {
          id: "rm-2-6",
          title: "프로펠러 고정 상태 및 크랙 점검",
          description: "프로펠러의 고정 상태와 균열, 손상 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "2. Arm 점검",
        },
        {
          id: "rm-2-7",
          title: "모터 및 조인트-파이트 연결 부위 확인",
          description: "모터와 조인트-파이트 연결 부위의 상태 확인",
          isCompleted: false,
          isRequired: true,
          category: "2. Arm 점검",
        },
      ],
    },
    {
      id: "periodic-maintenance",
      title: "정기 점검 체크리스트",
      description: "드론 정기 점검 및 종합 유지보수 절차",
      icon: <Wrench className="h-6 w-6" />,
      categories: ["1. Main body 점검", "2. Arm 점검", "3. 비행점검"],
      items: [
        // 1. Main body 점검
        {
          id: "pm-1-1",
          title: "Main Frame 크랙 점검",
          description: "메인 프레임의 균열이나 손상 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. Main body 점검",
        },
        {
          id: "pm-1-2",
          title: "전장품 고정 상태 점검",
          description: "전자장비의 고정 상태 및 나사 풀림 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. Main body 점검",
        },
        {
          id: "pm-1-3",
          title: "전선 단선 여부 점검",
          description: "전선의 단선이나 손상 여부를 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. Main body 점검",
        },
        {
          id: "pm-1-4",
          title: "GNSS module 지지대 고정 상태 및 크랙 점검",
          description: "GNSS 모듈 지지대의 고정 상태와 균열 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. Main body 점검",
        },
        {
          id: "pm-1-5",
          title: "Landing Gear 고정 상태 및 크랙 점검",
          description: "랜딩 기어의 고정 상태와 균열 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. Main body 점검",
        },
        {
          id: "pm-1-6",
          title: "배송함 및 그리퍼 고정 점검",
          description: "배송함과 그리퍼의 고정 상태 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. Main body 점검",
        },
        {
          id: "pm-1-7",
          title: "배터리 케이스 고정 상태 및 크랙 점검",
          description: "배터리 케이스의 고정 상태와 균열 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. Main body 점검",
        },
        {
          id: "pm-1-8",
          title: "카메라 거치대 고정 상태 및 크랙 점검",
          description: "카메라 거치대의 고정 상태와 균열 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. Main body 점검",
        },
        {
          id: "pm-1-9",
          title: "안테나 거치대 고정 상태 및 크랙 점검",
          description: "안테나 거치대의 고정 상태와 균열 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "1. Main body 점검",
        },
        // 2. Arm 점검
        {
          id: "pm-2-1",
          title: "Arm Frame 크랙 점검",
          description: "암 프레임의 균열이나 손상 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "2. Arm 점검",
        },
        {
          id: "pm-2-2",
          title: "모터 고정 상태 점검",
          description: "모터의 고정 상태 및 나사 풀림 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "2. Arm 점검",
        },
        {
          id: "pm-2-3",
          title: "ESC 고정 상태 점검",
          description: "ESC의 고정 상태 및 나사 풀림 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "2. Arm 점검",
        },
        {
          id: "pm-2-4",
          title: "모터/ESC 작동 상태 및 회전 방향 점검",
          description: "모터와 ESC의 작동 상태 및 프로펠러 회전 방향 확인",
          isCompleted: false,
          isRequired: true,
          category: "2. Arm 점검",
        },
        {
          id: "pm-2-5",
          title: "모터, ESC 고정용 프레임 고정 상태 및 크랙 점검",
          description: "모터와 ESC 고정용 프레임의 고정 상태와 균열 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "2. Arm 점검",
        },
        {
          id: "pm-2-6",
          title: "전선 단선 여부 점검",
          description: "암 부분 전선의 단선이나 손상 여부를 확인",
          isCompleted: false,
          isRequired: true,
          category: "2. Arm 점검",
        },
        {
          id: "pm-2-7",
          title: "프로펠러 고정 상태 및 크랙 점검",
          description: "프로펠러의 고정 상태와 균열, 손상 여부 확인",
          isCompleted: false,
          isRequired: true,
          category: "2. Arm 점검",
        },
        {
          id: "pm-2-8",
          title: "모터 및 조인트-파인트 연결 부위 확인",
          description: "모터와 조인트-파인트 연결 부위의 상태 확인",
          isCompleted: false,
          isRequired: true,
          category: "2. Arm 점검",
        },
        // 3. 비행점검
        {
          id: "pm-3-1",
          title: "Pitch, Roll, Yaw 기동 테스트",
          description: "Pitch, Roll, Yaw 축의 기동 성능을 테스트",
          isCompleted: false,
          isRequired: true,
          category: "3. 비행점검",
        },
        {
          id: "pm-3-2",
          title: "호버링 테스트(Stabilization Mode)",
          description: "Stabilization Mode에서의 호버링 성능 테스트",
          isCompleted: false,
          isRequired: true,
          category: "3. 비행점검",
        },
        {
          id: "pm-3-3",
          title: "호버링 테스트(Altitude Mode)",
          description: "Altitude Mode에서의 호버링 성능 테스트",
          isCompleted: false,
          isRequired: true,
          category: "3. 비행점검",
        },
        {
          id: "pm-3-4",
          title: "호버링 테스트 (Position Mode)",
          description: "Position Mode에서의 호버링 성능 테스트",
          isCompleted: false,
          isRequired: true,
          category: "3. 비행점검",
        },
        {
          id: "pm-3-5",
          title: "전,후진 비행 테스트 (Position Mode)",
          description: "Position Mode에서의 전진, 후진 비행 성능 테스트",
          isCompleted: false,
          isRequired: true,
          category: "3. 비행점검",
        },
        {
          id: "pm-3-6",
          title: "삼각 비행 테스트(Position Mode)",
          description: "Position Mode에서의 삼각 비행 성능 테스트",
          isCompleted: false,
          isRequired: true,
          category: "3. 비행점검",
        },
        {
          id: "pm-3-7",
          title: "원주 비행 테스트(Position Mode)",
          description: "Position Mode에서의 원주 비행 성능 테스트",
          isCompleted: false,
          isRequired: true,
          category: "3. 비행점검",
        },
        {
          id: "pm-3-8",
          title: "미션 비행 테스트(Mission Mode)",
          description: "Mission Mode에서의 미션 비행 성능 테스트",
          isCompleted: false,
          isRequired: true,
          category: "3. 비행점검",
        },
        {
          id: "pm-3-9",
          title: "그리퍼 미션 비행 테스트(Mission Mode)",
          description: "Mission Mode에서의 그리퍼 미션 비행 성능 테스트",
          isCompleted: false,
          isRequired: true,
          category: "3. 비행점검",
        },
      ],
    },
  ])

  // 접힌 상태를 관리하는 상태 - 모든 분류가 접힌 상태로 시작
  const [collapsedCategories, setCollapsedCategories] = useState<
    Record<string, boolean>
  >({
    "1. 배터리 점검": true,
    "2. 조종기 점검": true,
    "3. Main Body 점검": true,
    "4. Arm 점검": true,
    "5. 통신 상태 점검": true,
    "6. GCS 미션 경로 점검": true,
    "7. 배터리 연결 후 최종 점검": true,
    // 비행 중 체크리스트 분류들
    "1. 기체 상태 확인": true,
    "2. 비행경로 확인": true,
    "3. 통신 상태 확인": true,
    "4. 물품 투하": true,
    // 비행 후 체크리스트 분류들
    "1. 배터리": true,
    "2. 기체 점검": true,
    // 상시 점검 체크리스트
    "1. Main body 점검": true,
    "2. Arm 점검": true,
    // 정기 점검 체크리스트
    "3. 비행점검": true,
  })

  // 체크리스트 추가/삭제 관련 상태
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newItem, setNewItem] = useState({
    title: "",
    description: "",
    category: "",
    manualId: "",
    isRequired: true,
  })

  const handleCheckboxChange = (
    manualId: string,
    itemId: string,
    checked: boolean,
  ) => {
    setManuals((prevManuals) =>
      prevManuals.map((manual) =>
        manual.id === manualId
          ? {
              ...manual,
              items: manual.items.map((item) =>
                item.id === itemId ? { ...item, isCompleted: checked } : item,
              ),
            }
          : manual,
      ),
    )
  }

  const handleAddItem = () => {
    if (!newItem.title || !newItem.category || !newItem.manualId) return

    const manual = manuals.find((m) => m.id === newItem.manualId)
    if (!manual) return

    const newItemId = `${newItem.manualId}-${Date.now()}`
    const itemToAdd: ChecklistItem = {
      id: newItemId,
      title: newItem.title,
      description: newItem.description,
      isCompleted: false,
      isRequired: newItem.isRequired,
      category: newItem.category,
    }

    setManuals((prevManuals) =>
      prevManuals.map((manual) =>
        manual.id === newItem.manualId
          ? {
              ...manual,
              items: [...manual.items, itemToAdd],
            }
          : manual,
      ),
    )

    // 폼 초기화
    setNewItem({
      title: "",
      description: "",
      category: "",
      manualId: "",
      isRequired: true,
    })
    setIsAddDialogOpen(false)
  }

  const handleDeleteItem = (manualId: string, itemId: string) => {
    setManuals((prevManuals) =>
      prevManuals.map((manual) =>
        manual.id === manualId
          ? {
              ...manual,
              items: manual.items.filter((item) => item.id !== itemId),
            }
          : manual,
      ),
    )
  }

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }))
  }

  const getCompletionStatus = (items: ChecklistItem[]) => {
    const completedCount = items.filter((item) => item.isCompleted).length
    const totalCount = items.length
    const requiredCompletedCount = items.filter(
      (item) => item.isRequired && item.isCompleted,
    ).length
    const requiredTotalCount = items.filter((item) => item.isRequired).length

    return {
      completedCount,
      totalCount,
      requiredCompletedCount,
      requiredTotalCount,
      isAllCompleted: completedCount === totalCount,
      isAllRequiredCompleted: requiredCompletedCount === requiredTotalCount,
    }
  }

  const getCategoryColor = (category: string) => {
    const colors = {
      // 비행 전 체크리스트
      "1. 배터리 점검": "bg-red-100 text-red-800 border-red-200",
      "2. 조종기 점검": "bg-blue-100 text-blue-800 border-blue-200",
      "3. Main Body 점검": "bg-green-100 text-green-800 border-green-200",
      "4. Arm 점검": "bg-purple-100 text-purple-800 border-purple-200",
      "5. 통신 상태 점검": "bg-orange-100 text-orange-800 border-orange-200",
      "6. GCS 미션 경로 점검":
        "bg-indigo-100 text-indigo-800 border-indigo-200",
      "7. 배터리 연결 후 최종 점검":
        "bg-pink-100 text-pink-800 border-pink-200",
      // 비행 중 체크리스트
      "1. 기체 상태 확인": "bg-red-100 text-red-800 border-red-200",
      "2. 비행경로 확인": "bg-blue-100 text-blue-800 border-blue-200",
      "3. 통신 상태 확인": "bg-green-100 text-green-800 border-green-200",
      "4. 물품 투하": "bg-purple-100 text-purple-800 border-purple-200",
      // 비행 후 체크리스트
      "1. 배터리": "bg-gray-100 text-gray-800 border-gray-200",
      "2. 기체 점검": "bg-gray-100 text-gray-800 border-gray-200",
      // 상시 점검 체크리스트
      "1. Main body 점검": "bg-yellow-100 text-yellow-800 border-yellow-200",
      "2. Arm 점검": "bg-amber-100 text-amber-800 border-amber-200",
      // 정기 점검 체크리스트
      "3. 비행점검": "bg-teal-100 text-teal-800 border-teal-200",
    }
    return (
      colors[category as keyof typeof colors] ||
      "bg-gray-100 text-gray-800 border-gray-200"
    )
  }

  const getCategoryIcon = (category: string) => {
    const icons = {
      // 비행 전 체크리스트
      "1. 배터리 점검": "🔋",
      "2. 조종기 점검": "🎮",
      "3. Main Body 점검": "🛩️",
      "4. Arm 점검": "⚙️",
      "5. 통신 상태 점검": "📡",
      "6. GCS 미션 경로 점검": "🗺️",
      "7. 배터리 연결 후 최종 점검": "✅",
      // 비행 중 체크리스트
      "1. 기체 상태 확인": "📊",
      "2. 비행경로 확인": "🛣️",
      "3. 통신 상태 확인": "📡",
      "4. 물품 투하": "📦",
      // 비행 후 체크리스트
      "1. 배터리": "🔋",
      "2. 기체 점검": "🔍",
      // 상시 점검 체크리스트
      "1. Main body 점검": "🛠️",
      "2. Arm 점검": "⚙️",
      // 정기 점검 체크리스트
      "3. 비행점검": "✈️",
    }
    return icons[category as keyof typeof icons] || "📋"
  }

  const groupItemsByCategory = (items: ChecklistItem[]) => {
    return items.reduce(
      (acc, item) => {
        const category = item.category || "기타"
        if (!acc[category]) {
          acc[category] = []
        }
        acc[category].push(item)
        return acc
      },
      {} as Record<string, ChecklistItem[]>,
    )
  }

  return (
    <div className="space-y-8 p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Typography variant="h2">비행 체크리스트</Typography>
          <Typography variant="p" className="text-muted-foreground">
            드론 운영 및 정비를 위한 체크리스트를 확인하세요.
          </Typography>
        </div>

        {/* 체크리스트 추가 버튼 */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" />
              체크리스트 추가
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>새 체크리스트 추가</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label htmlFor="manual-select" className="text-sm font-medium">
                  메뉴얼 선택
                </label>
                <select
                  id="manual-select"
                  value={newItem.manualId}
                  onChange={(e) =>
                    setNewItem({ ...newItem, manualId: e.target.value })
                  }
                  className="w-full rounded-md border border-gray-300 p-2"
                >
                  <option value="">메뉴얼을 선택하세요</option>
                  {manuals.map((manual) => (
                    <option key={manual.id} value={manual.id}>
                      {manual.title}
                    </option>
                  ))}
                </select>
              </div>

              {newItem.manualId && (
                <div className="grid gap-2">
                  <label
                    htmlFor="category-select"
                    className="text-sm font-medium"
                  >
                    카테고리 선택
                  </label>
                  <select
                    id="category-select"
                    value={newItem.category}
                    onChange={(e) =>
                      setNewItem({ ...newItem, category: e.target.value })
                    }
                    className="w-full rounded-md border border-gray-300 p-2"
                  >
                    <option value="">카테고리를 선택하세요</option>
                    {manuals
                      .find((m) => m.id === newItem.manualId)
                      ?.categories?.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div className="grid gap-2">
                <label htmlFor="title" className="text-sm font-medium">
                  제목
                </label>
                <Input
                  id="title"
                  value={newItem.title}
                  onChange={(e) =>
                    setNewItem({ ...newItem, title: e.target.value })
                  }
                  placeholder="체크리스트 제목을 입력하세요"
                />
              </div>

              <div className="grid gap-2">
                <label htmlFor="description" className="text-sm font-medium">
                  설명 (선택사항)
                </label>
                <Textarea
                  id="description"
                  value={newItem.description}
                  onChange={(e) =>
                    setNewItem({ ...newItem, description: e.target.value })
                  }
                  placeholder="체크리스트 설명을 입력하세요"
                  rows={3}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="required"
                  checked={newItem.isRequired}
                  onCheckedChange={(checked) =>
                    setNewItem({ ...newItem, isRequired: checked as boolean })
                  }
                />
                <label htmlFor="required" className="text-sm font-medium">
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
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {manuals.map((manual) => {
          const status = getCompletionStatus(manual.items)
          const groupedItems = groupItemsByCategory(manual.items)

          return (
            <Card
              key={manual.id}
              className="border-2 transition-shadow hover:shadow-lg"
            >
              <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-blue-100 p-2">
                      {manual.icon}
                    </div>
                    <div>
                      <CardTitle className="text-xl">{manual.title}</CardTitle>
                      <CardDescription className="mt-1">
                        {manual.description}
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

              <CardContent className="p-6">
                <div className="space-y-4">
                  {manual.categories?.map((category) => {
                    const categoryItems = groupedItems[category] || []
                    const categoryStatus = getCompletionStatus(categoryItems)
                    const isCollapsed = collapsedCategories[category]

                    return (
                      <div
                        key={category}
                        className="overflow-hidden rounded-lg border"
                      >
                        <button
                          onClick={() => toggleCategory(category)}
                          className="flex w-full items-center justify-between bg-gray-50 p-4 transition-colors hover:bg-gray-100"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">
                              {getCategoryIcon(category)}
                            </span>
                            <Typography
                              variant="h4"
                              className="text-base font-semibold"
                            >
                              {category}
                            </Typography>
                            <span
                              className={`rounded-full border px-2 py-1 text-xs font-medium ${getCategoryColor(category)}`}
                            >
                              {categoryStatus.completedCount}/
                              {categoryStatus.totalCount}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {categoryStatus.isAllCompleted && (
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
                          <div className="space-y-3 bg-white p-4">
                            {categoryItems.map((item) => (
                              <div
                                key={item.id}
                                className={`flex items-start gap-3 rounded-lg border p-3 transition-all duration-200 ${
                                  item.isCompleted
                                    ? "border-green-200 bg-green-50 shadow-sm"
                                    : "border-gray-200 bg-white hover:bg-gray-50 hover:shadow-sm"
                                }`}
                              >
                                <Checkbox
                                  id={item.id}
                                  checked={item.isCompleted}
                                  onCheckedChange={(checked) =>
                                    handleCheckboxChange(
                                      manual.id,
                                      item.id,
                                      checked as boolean,
                                    )
                                  }
                                  className="mt-1"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="mb-1 flex items-center gap-2">
                                    <label
                                      htmlFor={item.id}
                                      className={`cursor-pointer font-medium ${
                                        item.isCompleted
                                          ? "text-green-700 line-through"
                                          : "text-gray-900"
                                      }`}
                                    >
                                      {item.title}
                                    </label>
                                    {item.isRequired && (
                                      <span className="rounded bg-red-100 px-2 py-1 text-xs text-red-700">
                                        필수
                                      </span>
                                    )}
                                  </div>
                                  {item.description && (
                                    <Typography
                                      variant="p"
                                      className={`text-sm ${
                                        item.isCompleted
                                          ? "text-green-600"
                                          : "text-muted-foreground"
                                      }`}
                                    >
                                      {item.description}
                                    </Typography>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    handleDeleteItem(manual.id, item.id)
                                  }
                                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {status.isAllCompleted && (
                  <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4">
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="h-5 w-5" />
                      <Typography variant="p" className="font-medium">
                        모든 체크리스트가 완료되었습니다!
                      </Typography>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
