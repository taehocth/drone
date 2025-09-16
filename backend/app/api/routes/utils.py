from fastapi import APIRouter, Depends
from pydantic.networks import EmailStr
import requests

from app.api.deps import get_current_active_superuser
from app.models import Message, KindexResponse
from app.utils import generate_test_email, send_email

router = APIRouter()


@router.post(
    "/test-email/",
    dependencies=[Depends(get_current_active_superuser)],
    status_code=201,
)
def test_email(email_to: EmailStr) -> Message:
    """
    Test emails.
    """
    email_data = generate_test_email(email_to=email_to)
    send_email(
        email_to=email_to,
        subject=email_data.subject,
        html_content=email_data.html_content,
    )
    return Message(message="Test email sent")


@router.get("/geomagnetic-kindex/", response_model=KindexResponse)
def geomagnetic_kindex() -> KindexResponse:
    """
    지구 자기장 지수 가져오기
    """
    response = requests.get("https://spaceweather.kasa.go.kr/api/kindex", verify=False)
    data = response.json()
    return KindexResponse(
        error=data["error"],
        errorCode=data["errorCode"],
        kindex=data["kindex"]
    )

@router.get("/health-check", response_model=Message)
@router.get("/health-check/", response_model=Message)
def health_check() -> Message:
    return Message(message="true")