from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from pyulog import ULog
import tempfile
import csv
import io

router = APIRouter(tags=["logs-convert"])

@router.post("/ulg-to-csv")
async def convert_ulg_to_csv(file: UploadFile = File(...)):
    """
    ULG → CSV 변환해서 다운로드로 제공
    """
    try:
        if not file.filename.endswith(".ulg"):
            raise HTTPException(status_code=400, detail="ULG 파일만 변환할 수 있습니다.")

        # 임시 파일 저장
        with tempfile.NamedTemporaryFile(delete=False, suffix=".ulg") as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        # ULG 파싱
        ulog = ULog(tmp_path)

        # CSV 를 RAM 메모리로 생성
        output = io.StringIO()
        writer = csv.writer(output)

        # 헤더 작성
        writer.writerow(["timestamp", "topic", "field", "value"])

        # 모든 토픽 순회하여 기록
        for d in ulog.data_list:
            topic = d.name
            for field_name, values in d.data.items():
                for i, v in enumerate(values):
                    writer.writerow([
                        d.data["timestamp"][i],
                        topic,
                        field_name,
                        v
                    ])

        output.seek(0)

        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=converted.csv"}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
