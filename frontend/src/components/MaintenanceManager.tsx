import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const maintenanceSchema = z.object({
  part: z.string(),
  action: z.string(),
  date: z.string(),
  technician: z.string(),
})

export function MaintenanceManager() {
  const [records, setRecords] = useState<any[]>([])
  const form = useForm({ resolver: zodResolver(maintenanceSchema) })

  const onSubmit = (data: any) => {
    setRecords((prev) => [...prev, data])
    form.reset()
  }

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>정비 항목 추가</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid grid-cols-4 gap-4"
          >
            <Input placeholder="부품 (예: 모터)" {...form.register("part")} />
            <Input
              placeholder="조치 내용 (예: 교체 완료)"
              {...form.register("action")}
            />
            <Input placeholder="날짜 (YYYY-MM-DD)" {...form.register("date")} />
            <Input placeholder="담당자" {...form.register("technician")} />
            <Button type="submit" className="col-span-4 mt-2">
              등록
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>정비 이력</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>부품</TableHead>
                <TableHead>조치 내용</TableHead>
                <TableHead>날짜</TableHead>
                <TableHead>담당자</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((rec, idx) => (
                <TableRow key={idx}>
                  <TableCell>{rec.part}</TableCell>
                  <TableCell>{rec.action}</TableCell>
                  <TableCell>{rec.date}</TableCell>
                  <TableCell>{rec.technician}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
