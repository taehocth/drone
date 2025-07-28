import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useTheme } from "next-themes"

const Appearance = () => {
  const { theme, setTheme } = useTheme()

  return (
    <Card>
      <CardHeader>
        <CardTitle>테마 설정</CardTitle>
        <CardDescription>
          애플리케이션의 테마를 선택할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup value={theme} onValueChange={setTheme}>
          <div className="mb-3 flex items-center space-x-2">
            <RadioGroupItem value="light" id="light" />
            <Label
              htmlFor="light"
              className="flex cursor-pointer items-center gap-2"
            >
              라이트 모드
              <Badge variant="secondary">기본값</Badge>
            </Label>
          </div>
          <div className="mb-3 flex items-center space-x-2">
            <RadioGroupItem value="dark" id="dark" />
            <Label htmlFor="dark" className="cursor-pointer">
              다크 모드
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="system" id="system" />
            <Label htmlFor="system" className="cursor-pointer">
              시스템 설정 따르기
            </Label>
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  )
}
export default Appearance
