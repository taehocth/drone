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
    ULG → CSV 변환 후 다운로드 제공
    """
    try:
        # 파일 확장자 검증
        if not file.filename.endswith(".ulg"):
            raise HTTPException(
                status_code=400,
                detail="ULG 파일만 변환할 수 있습니다."
            )

        # ULG 파일 임시 저장
        with tempfile.NamedTemporaryFile(delete=False, suffix=".ulg") as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        # ULG 파싱
        try:
            ulog = ULog(tmp_path)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"ULG 파일 파싱 실패: {e}"
            )

        # CSV 메모리에 생성
        output = io.StringIO()
        writer = csv.writer(output)

        # CSV 헤더
        writer.writerow(["timestamp", "topic", "field", "value"])

        # 모든 토픽과 필드를 CSV에 기록
        for d in ulog.data_list:
            topic = d.name
            data = d.data

            # timestamp 존재 여부 확인
            if "timestamp" not in data:
                continue

            timestamps = data["timestamp"]

            for field_name, values in data.items():
                if field_name == "timestamp":
                    continue  # timestamp는 이미 사용됨

                # 필드 길이와 timestamp 길이 차이 보정
                min_len = min(len(timestamps), len(values))

                for i in range(min_len):
                    writer.writerow([
                        timestamps[i],
                        topic,
                        field_name,
                        values[i]
                    ])

        # CSV 스트림 초기화
        output.seek(0)

        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": "attachment; filename=converted.csv"
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"서버 오류: {e}")
