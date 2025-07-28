import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useState } from "react"
import DeleteConfirmation from "./DeleteConfirmation"

const DeleteAccount = () => {
  const [showConfirmation, setShowConfirmation] = useState(false)

  return (
    <>
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">계정 삭제</CardTitle>
          <CardDescription>
            계정과 연결된 모든 데이터를 영구적으로 삭제합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-muted-foreground text-sm">
            이 작업은 되돌릴 수 없습니다. 계정과 관련된 모든 데이터가 영구적으로
            삭제됩니다.
          </p>
          <Button
            variant="destructive"
            onClick={() => setShowConfirmation(true)}
          >
            계정 삭제
          </Button>
        </CardContent>
      </Card>

      <DeleteConfirmation
        open={showConfirmation}
        onOpenChange={setShowConfirmation}
      />
    </>
  )
}
export default DeleteAccount
