# -*- coding: utf-8 -*-
"""
항공정비일반 12주차 (항공정비 인적요소) - 업무 압박 기록·분석 도구 생성 스크립트

실행:  python3 build_workbook.py [출력경로]
기본 출력: ../업무압박_기록분석도구.xlsx

- 모든 계산 결과는 Excel 수식(라이브 계산)으로 기록한다. Python에서 계산한 값을 붙여넣지 않는다.
- Excel 2016 / LibreOffice 호환: 동적 배열 함수(FILTER, UNIQUE, LET, XLOOKUP, SORT 등) 미사용.
- 매크로 없음(.xlsx).
- 생성 후 LibreOffice로 재계산(xlsx 스킬의 recalc.py)해야 캐시 값이 채워진다.
"""
import os
import sys
from datetime import date, time

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.comments import Comment
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.worksheet.pagebreak import Break

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.join(os.path.dirname(HERE), "업무압박_기록분석도구.xlsx")

# ---------------------------------------------------------------- 스타일
FONT_NAME = "맑은 고딕"  # 한글 표시용 표준 글꼴 (Excel 한국어판 기본)


def F(size=10, bold=False, color="000000", italic=False):
    return Font(name=FONT_NAME, size=size, bold=bold, color=color, italic=italic)


def fill(hex_):
    return PatternFill("solid", start_color=hex_, end_color=hex_)


NAVY = "1F3A5F"
SLATE = "4A5A6A"
INPUT_FILL = fill("FFF8DC")     # 입력 셀: 연한 노랑
FORMULA_FILL = fill("EEF1F4")   # 수식 셀: 연한 회색
HDR_INPUT_FILL = fill(NAVY)
HDR_FORMULA_FILL = fill(SLATE)
BANNER_FILL = fill("FDE9E7")
NOTICE_FILL = fill("FFF4E5")
SECTION_FILL = fill("DCE6F0")
KPI_FILL = fill("F7F9FB")
THIN = Side(style="thin", color="B7C0C8")
MED = Side(style="medium", color="7F8C99")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
BOX_BORDER = Border(left=MED, right=MED, top=MED, bottom=MED)
WRAP_TOP = Alignment(wrap_text=True, vertical="top")
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True)

BAR_COLOR = "4F6D8F"  # 차트 단일 색 (절제된 청회색)

FIRST = 5          # 기록입력 첫 데이터 행
LAST = 504         # 기록입력 마지막 데이터 행 (500행)
STD_FIRST = 5      # 기준시간표 첫 행
STD_LAST = 26      # 기준시간표 마지막 행 (22행: 예시 12 + 빈 행 10)

SAMPLE_BANNER = "가상 예시 데이터 — 지우고 본인 기록을 입력하세요"
GUIDE_SENTENCE = ("핵심은 누구의 잘못을 찾는 것이 아니라, "
                  "안전하게 정비할 수 있는 작업 조건을 만드는 것입니다.")


def rng(col):
    """기록입력 열 전체 범위 (절대참조)"""
    return f"기록입력!${col}${FIRST}:${col}${LAST}"


def style_range(ws, ref, border=None, fill_=None, font=None, align=None):
    for row in ws[ref]:
        for c in row:
            if border is not None:
                c.border = border
            if fill_ is not None:
                c.fill = fill_
            if font is not None:
                c.font = font
            if align is not None:
                c.alignment = align


def merge_write(ws, ref, value, font=None, fill_=None, align=WRAP_TOP, border=None):
    ws.merge_cells(ref)
    first = ws[ref.split(":")[0]]
    first.value = value
    style_range(ws, ref, border=border, fill_=fill_, font=font, align=align)
    return first


def set_widths(ws, widths):
    for col, w in widths.items():
        ws.column_dimensions[col].width = w


# ---------------------------------------------------------------- 기준 데이터
STD_TASKS = [
    ("객실 좌석 결함 점검", 35, "좌석 리클라인·테이블·벨트 등"),
    ("타이어 교환", 60, "잭업·토크 작업 포함"),
    ("휠/브레이크 점검", 45, "마모 핀 확인 등"),
    ("오일 보충", 20, "엔진/APU 오일"),
    ("외부 점검(Walk-around)", 30, "출발 전 외부 점검"),
    ("객실 조명 결함", 25, ""),
    ("항법등 교환", 30, ""),
    ("화장실 계통 결함", 40, "급수·배수·플러시"),
    ("기내 엔터테인먼트 결함", 30, "IFE 리셋·LRU 교환"),
    ("로그북 결함 이월 처리(MEL)", 25, "MEL 적용 판단·서류 처리"),
    ("배터리 점검", 30, ""),
    ("기타", 30, "위 항목에 없는 작업"),
]

DEPTS = ["정비계획", "운항관리", "정비통제", "현장 감독", "기타"]
SHORTAGE = ["없음", "인력", "공구·장비", "부품", "복합"]
YESNO = ["예", "아니오"]
CONCERN = ["없음", "시간 부족 전달", "인력·장비 부족 전달", "작업 중단 요청", "기타"]
ACTION = ["그대로 진행", "완료시간 재협의", "인력 추가", "작업 이월", "기타"]
BANDS = ["06-10시", "10-14시", "14-18시", "18-22시", "22-06시"]
FACTORS = [
    ("압박(Pressure)", "S", "시간압박지수 ≥ 위험 기준"),
    ("스트레스(Stress)", "T", "요청 변경 횟수 ≥ 스트레스 기준"),
    ("피로(Fatigue)", "U", "연장근무 중 = 예"),
    ("의사소통 부족(Lack of Communication)", "V", "안전 우려 제기 후 조치 = 그대로 진행"),
    ("자원 부족(Lack of Resources)", "W", "인력·공구 부족 ≠ 없음"),
]

# 가상 예시 데이터: (날짜, 접수 hh:mm, 요구완료 hh:mm, 작업 유형, 요청 부서, 실제완료 hh:mm,
#                    변경 횟수, 부족, 연장근무, 안전 우려, 조치, 메모)
SAMPLE = [
    ("2026-10-20", "13:00", "13:20", "객실 좌석 결함 점검", "운항관리", "13:42", 2, "없음", "아니오",
     "시간 부족 전달", "완료시간 재협의", "출발 20분 전 좌석 결함 접수. 기준 35분 대비 20분 요구 (대표 예시)"),
    ("2026-10-20", "15:10", "15:40", "타이어 교환", "정비통제", "16:25", 1, "인력", "아니오",
     "시간 부족 전달", "그대로 진행", "연결편 출발시각에 맞춰 단축 요청"),
    ("2026-10-21", "08:20", "09:00", "외부 점검(Walk-around)", "운항관리", "08:52", 0, "없음", "아니오",
     "없음", "그대로 진행", ""),
    ("2026-10-21", "14:40", "15:15", "휠/브레이크 점검", "운항관리", "15:32", 2, "공구·장비", "아니오",
     "시간 부족 전달", "완료시간 재협의", "토크렌치 대기 10분"),
    ("2026-10-22", "10:30", "11:10", "오일 보충", "정비계획", "10:48", 0, "없음", "아니오",
     "없음", "그대로 진행", ""),
    ("2026-10-22", "16:05", "16:45", "휠/브레이크 점검", "정비통제", "17:00", 1, "없음", "예",
     "시간 부족 전달", "그대로 진행", "오후 턴어라운드 집중 시간"),
    ("2026-10-23", "19:30", "20:30", "객실 조명 결함", "정비계획", "19:52", 0, "없음", "아니오",
     "없음", "그대로 진행", ""),
    ("2026-10-23", "23:10", "00:10", "배터리 점검", "정비통제", "23:45", 0, "없음", "예",
     "없음", "그대로 진행", "야간 정비 (자정 넘김)"),
    ("2026-10-24", "14:20", "15:05", "타이어 교환", "현장 감독", "15:28", 1, "인력", "아니오",
     "인력·장비 부족 전달", "인력 추가", "2인 작업 필요, 1명 추가 배치 후 진행"),
    ("2026-10-24", "11:00", "12:00", "기내 엔터테인먼트 결함", "정비계획", "11:34", 0, "없음", "아니오",
     "없음", "그대로 진행", ""),
    ("2026-10-26", "07:10", "08:00", "외부 점검(Walk-around)", "운항관리", "07:38", 0, "없음", "아니오",
     "없음", "그대로 진행", ""),
    ("2026-10-26", "15:30", "15:55", "객실 좌석 결함 점검", "운항관리", "16:11", 2, "없음", "아니오",
     "시간 부족 전달", "그대로 진행", "탑승 시작 전 완료 요구"),
    ("2026-10-27", "09:40", "10:25", "항법등 교환", "정비계획", "10:13", 0, "없음", "아니오",
     "없음", "그대로 진행", ""),
    ("2026-10-27", "17:00", "17:50", "화장실 계통 결함", "정비통제", "17:47", 1, "없음", "아니오",
     "없음", "그대로 진행", ""),
    ("2026-10-28", "13:30", "14:30", "로그북 결함 이월 처리(MEL)", "정비계획", "13:50", 0, "없음", "아니오",
     "없음", "그대로 진행", ""),
    ("2026-10-28", "14:50", "15:20", "휠/브레이크 점검", "운항관리", "15:39", 3, "공구·장비", "예",
     "작업 중단 요청", "작업 이월", "요구시간이 세 번 바뀜. 작업 중단 요청 후 다음 편으로 이월"),
    ("2026-10-29", "21:00", "22:00", "화장실 계통 결함", "정비통제", "21:44", 0, "없음", "예",
     "없음", "그대로 진행", ""),
    ("2026-10-29", "02:30", "04:00", "타이어 교환", "정비계획", "03:32", 0, "없음", "예",
     "없음", "그대로 진행", "야간 계획 정비"),
    ("2026-10-30", "15:45", "16:25", "객실 좌석 결함 점검", "현장 감독", "16:23", 1, "없음", "아니오",
     "없음", "그대로 진행", ""),
    ("2026-10-30", "10:15", "10:45", "오일 보충", "운항관리", "10:30", 0, "없음", "아니오",
     "없음", "그대로 진행", ""),
    ("2026-10-31", "16:20", "16:50", "휠/브레이크 점검", "정비통제", "17:10", 2, "인력", "아니오",
     "인력·장비 부족 전달", "그대로 진행", "보조 인력 요청했으나 회신 없음"),
    ("2026-11-02", "08:00", "08:45", "외부 점검(Walk-around)", "운항관리", "08:30", 0, "없음", "아니오",
     "없음", "그대로 진행", ""),
    ("2026-11-02", "12:40", "13:20", "객실 조명 결함", "정비계획", "13:07", 0, "없음", "아니오",
     "없음", "그대로 진행", ""),
    ("2026-11-03", "14:10", "15:00", "타이어 교환", "운항관리", "15:20", 1, "부품", "아니오",
     "시간 부족 전달", "완료시간 재협의", "교환용 휠 어셈블리 출고 대기"),
    ("2026-11-03", "20:30", "21:30", "기내 엔터테인먼트 결함", "정비계획", "21:01", 0, "없음", "아니오",
     "없음", "그대로 진행", ""),
    ("2026-11-04", "22:40", "23:40", "로그북 결함 이월 처리(MEL)", "정비통제", "23:04", 0, "없음", "예",
     "없음", "그대로 진행", ""),
    ("2026-11-04", "15:00", "16:00", "배터리 점검", "현장 감독", "15:29", 0, "없음", "아니오",
     "없음", "그대로 진행", ""),
    ("2026-11-05", "17:30", "18:00", "객실 좌석 결함 점검", "정비통제", "18:09", 1, "없음", "예",
     "없음", "그대로 진행", "우려를 말하지 못하고 진행함"),
    ("2026-11-05", "11:20", "12:05", "항법등 교환", "정비계획", "11:48", 0, "없음", "아니오",
     "없음", "그대로 진행", ""),
    ("2026-11-06", "14:35", "15:10", "휠/브레이크 점검", "운항관리", "15:23", 2, "복합", "아니오",
     "시간 부족 전달", "완료시간 재협의", ""),
    ("2026-11-06", "06:30", "07:10", "외부 점검(Walk-around)", "운항관리", "07:01", 0, "없음", "아니오",
     "없음", "그대로 진행", ""),
    ("2026-11-07", "13:50", "14:30", "기타", "기타", "14:20", 0, "없음", "아니오",
     "없음", "그대로 진행", "객실 패널 고정 상태 확인"),
    ("2026-11-07", "18:40", "19:40", "화장실 계통 결함", "정비계획", "19:21", 0, "없음", "아니오",
     "없음", "그대로 진행", ""),
    ("2026-11-09", "15:15", "16:00", "타이어 교환", "정비통제", "16:21", 2, "인력", "예",
     "인력·장비 부족 전달", "인력 추가", ""),
    ("2026-11-09", "09:00", "09:30", "오일 보충", "정비계획", "09:19", 0, "없음", "아니오",
     "없음", "그대로 진행", ""),
    ("2026-11-10", "16:40", "17:20", "객실 좌석 결함 점검", "운항관리", "17:17", 0, "없음", "아니오",
     "없음", "그대로 진행", ""),
    ("2026-11-10", "23:50", "00:40", "배터리 점검", "정비통제", "00:45", 0, "없음", "예",
     "없음", "그대로 진행", "자정을 넘기는 요청 (계산 확인용)"),
    ("2026-11-11", "14:05", "14:35", "휠/브레이크 점검", "현장 감독", "14:52", 1, "공구·장비", "아니오",
     "시간 부족 전달", "그대로 진행", "잭 대기 후 바로 착수"),
    ("2026-11-11", "10:50", "11:50", "기내 엔터테인먼트 결함", "정비계획", "11:26", 0, "없음", "아니오",
     "없음", "그대로 진행", ""),
    ("2026-11-12", "15:20", "16:10", "객실 조명 결함", "운항관리", "15:44", 0, "없음", "아니오",
     "없음", "그대로 진행", ""),
    ("2026-11-12", "01:15", "01:55", "로그북 결함 이월 처리(MEL)", "정비통제", "01:41", 0, "없음", "예",
     "없음", "그대로 진행", ""),
]


def t(s):
    h, m = s.split(":")
    return time(int(h), int(m))


def d(s):
    y, m, dd = s.split("-")
    return date(int(y), int(m), int(dd))


# ---------------------------------------------------------------- 기록입력 열 정의
# (열, 머리글, 입력여부, 너비, 설명)
LOG_COLS = [
    ("A", "날짜", True, 11.5, "작업 요청을 받은 날짜 (예: 2026-11-12)"),
    ("B", "요청 접수 시각", True, 9.5, "요청을 받은 시각, hh:mm (예: 13:00)"),
    ("C", "요구 완료 시각", True, 9.5, "요청자가 요구한 완료 시각, hh:mm. 자정을 넘겨도 됩니다"),
    ("D", "작업 유형", True, 24, "목록에서 선택 (기준시간표 시트의 작업 유형)"),
    ("E", "요청 부서", True, 10.5, "목록에서 선택. 사람 이름이 아니라 부서/직무만 기록"),
    ("F", "실제 완료 시각", True, 9.5, "실제로 작업을 마친 시각, hh:mm (모르면 비워 둠)"),
    ("G", "요청 변경 횟수", True, 8.5, "완료 시각·작업 범위 요청이 바뀐 횟수 (0, 1, 2 ...)"),
    ("H", "인력·공구 부족", True, 10.5, "목록에서 선택: 없음 / 인력 / 공구·장비 / 부품 / 복합"),
    ("I", "연장근무 중 여부", True, 8.5, "요청 당시 연장근무 중이었는지: 예 / 아니오"),
    ("J", "안전 우려 제기", True, 15, "본인이 우려를 전달했는지, 어떤 내용이었는지 선택"),
    ("K", "요청 이후 조치", True, 14, "우려 전달 이후 실제로 어떻게 되었는지 선택"),
    ("L", "메모", True, 34, "사실만 간단히. 이름·기번(등록부호)·회사명은 쓰지 않음"),
    ("M", "기준 소요시간(분)", False, 9.5, "자동: 기준시간표에서 작업 유형의 기준 시간을 찾아옴"),
    ("N", "주어진 시간(분)", False, 9.5, "자동: 요구 완료 − 요청 접수 (자정 넘김 처리, MOD 사용)"),
    ("O", "실제 소요시간(분)", False, 9.5, "자동: 실제 완료 − 요청 접수 (자정 넘김 처리)"),
    ("P", "시간압박지수", False, 9.5, "자동: 기준 소요시간 ÷ 주어진 시간"),
    ("Q", "판정", False, 8, "자동: 적정 / 주의 / 위험 (기준값은 설정 시트)"),
    ("R", "시간대", False, 9, "자동: 요청 접수 시각 기준 06-10 / 10-14 / 14-18 / 18-22 / 22-06시"),
    ("S", "압박(Pressure)", False, 10, "자동: 시간압박지수 ≥ 위험 기준이면 '해당'"),
    ("T", "스트레스(Stress)", False, 10, "자동: 요청 변경 횟수 ≥ 스트레스 기준이면 '해당'"),
    ("U", "피로(Fatigue)", False, 10, "자동: 연장근무 중 = 예 이면 '해당'"),
    ("V", "의사소통 부족(Lack of Communication)", False, 15,
     "자동: 안전 우려를 제기했는데 조치가 '그대로 진행'이면 '해당'"),
    ("W", "자원 부족(Lack of Resources)", False, 12, "자동: 인력·공구 부족이 '없음'이 아니면 '해당'"),
]

# 설정 시트 셀 주소
S_CAUTION = "설정!$C$5"
S_DANGER = "설정!$C$6"
S_STRESS = "설정!$C$7"
S_REAL_HI = "설정!$C$8"
S_REAL_LO = "설정!$C$9"
LIST_ROW0 = 14  # 설정 시트 목록 첫 행


def list_ref(col, n):
    return f"설정!${col}${LIST_ROW0}:${col}${LIST_ROW0 + n - 1}"


def band_cell(i):
    return f"설정!$G${LIST_ROW0 + i}"


# ================================================================ 시트: 설정
def build_settings(wb):
    ws = wb.create_sheet("설정")
    set_widths(ws, {"A": 2, "B": 30, "C": 12, "D": 62, "E": 16, "F": 20, "G": 12})
    ws["B1"] = "설정 — 판정 기준값과 선택 목록"
    ws["B1"].font = F(15, True, NAVY)
    ws["B2"] = ("아래 노란 칸의 값을 바꾸면 기록입력·분석·보고서가 모두 다시 계산됩니다. "
                "이 값은 수업용 예시이며 법규·규정상 기준이 아닙니다.")
    ws["B2"].font = F(10, color="555555")
    ws.merge_cells("B2:D2")
    ws["B2"].alignment = LEFT
    ws.row_dimensions[2].height = 30

    for col, h in zip("BCD", ["항목", "값", "설명"]):
        c = ws[f"{col}4"]
        c.value = h
        c.font = F(10, True, "FFFFFF")
        c.fill = HDR_INPUT_FILL
        c.alignment = CENTER
        c.border = BORDER
    rows = [
        ("주의 기준 (시간압박지수)", 0.8, "지수가 이 값 이상이고 위험 기준 미만이면 '주의'. 이 값 미만이면 '적정'.", "0.00"),
        ("위험 기준 (시간압박지수)", 1.0, "지수가 이 값 이상이면 '위험'이고 압박(Pressure) 요인 '해당'. 1.0 = 기준 시간과 주어진 시간이 같음.", "0.00"),
        ("스트레스 기준 (요청 변경 횟수)", 2, "요청 변경 횟수가 이 값 이상이면 스트레스(Stress) 요인 '해당'.", "0"),
        ("기준 현실성: '기준이 짧음' 경계 (실제÷기준)", 1.2, "분석 시트의 '기준 대비 실제' 비율이 이 값 이상이면 기준 소요시간이 현실보다 짧다는 뜻.", "0.00"),
        ("기준 현실성: '기준이 넉넉함' 경계 (실제÷기준)", 0.8, "비율이 이 값 미만이면 기준 소요시간이 현실보다 넉넉하다는 뜻.", "0.00"),
    ]
    for i, (label, val, desc, fmt) in enumerate(rows):
        r = 5 + i
        ws[f"B{r}"] = label
        ws[f"C{r}"] = val
        ws[f"D{r}"] = desc
        ws[f"B{r}"].font = F(10, True)
        ws[f"C{r}"].font = F(11, True, "0000FF")
        ws[f"C{r}"].fill = fill("FFFF99")
        ws[f"C{r}"].number_format = fmt
        ws[f"C{r}"].alignment = CENTER
        ws[f"D{r}"].font = F(9, color="333333")
        for col in "BCD":
            ws[f"{col}{r}"].border = BORDER
            if col != "C":
                ws[f"{col}{r}"].alignment = LEFT
        ws.row_dimensions[r].height = 32
    ws["C5"].comment = Comment("수업용 예시 기준값(사용자 지정). 규정상 기준 아님. 수업에서 토론 후 조정하세요.", "도구")

    ws[f"B{LIST_ROW0 - 2}"] = "선택 목록 (드롭다운에 쓰임 — 항목 이름을 바꾸면 기존 기록과 맞지 않게 되니 주의)"
    ws[f"B{LIST_ROW0 - 2}"].font = F(11, True, NAVY)
    lists = [("B", "요청 부서", DEPTS), ("C", "연장근무 중", YESNO), ("D", "안전 우려 제기", CONCERN),
             ("E", "인력·공구 부족", SHORTAGE), ("F", "요청 이후 조치", ACTION), ("G", "시간대 (자동 구분)", BANDS)]
    for col, head, items in lists:
        c = ws[f"{col}{LIST_ROW0 - 1}"]
        c.value = head
        c.font = F(10, True, "FFFFFF")
        c.fill = HDR_FORMULA_FILL
        c.alignment = CENTER
        c.border = BORDER
        for i, it in enumerate(items):
            cc = ws[f"{col}{LIST_ROW0 + i}"]
            cc.value = it
            cc.font = F(10)
            cc.border = BORDER
    ws[f"G{LIST_ROW0 + 6}"] = "시간대는 요청 접수 시각으로 자동 구분됩니다."
    ws[f"G{LIST_ROW0 + 6}"].font = F(9, color="666666")
    ws.sheet_view.showGridLines = False
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    return ws


# ================================================================ 시트: 기준시간표
def build_standard(wb):
    ws = wb.create_sheet("기준시간표")
    set_widths(ws, {"A": 30, "B": 16, "C": 46})
    ws["A1"] = "기준시간표 — 작업 유형별 기준 예상 소요시간"
    ws["A1"].font = F(15, True, NAVY)
    ws.merge_cells("A2:C2")
    ws["A2"] = ("※ 아래 분(分) 값은 '예시 값'입니다. 본인 회사의 정비 교범·작업카드·현장 경험을 근거로 "
                "본인 기준으로 바꾸세요. 새 작업 유형은 빈 행(맨 아래까지)에 이어서 추가하면 "
                "기록입력의 드롭다운과 분석에 자동 반영됩니다. 중간에 빈 행을 두지 마세요.")
    ws["A2"].font = F(10, True, "9C3D00")
    ws["A2"].fill = NOTICE_FILL
    ws["A2"].alignment = LEFT
    ws.row_dimensions[2].height = 48

    heads = ["작업 유형", "기준 예상 소요시간(분)\n[예시 값]", "비고"]
    for i, h in enumerate(heads):
        c = ws.cell(row=4, column=i + 1, value=h)
        c.font = F(10, True, "FFFFFF")
        c.fill = HDR_INPUT_FILL
        c.alignment = CENTER
        c.border = BORDER
    ws.row_dimensions[4].height = 32
    for r in range(STD_FIRST, STD_LAST + 1):
        idx = r - STD_FIRST
        if idx < len(STD_TASKS):
            name, mins, note = STD_TASKS[idx]
            ws.cell(row=r, column=1, value=name)
            ws.cell(row=r, column=2, value=mins)
            ws.cell(row=r, column=3, value=("예시 값. " + note).strip() if note else "예시 값")
        for col in range(1, 4):
            c = ws.cell(row=r, column=col)
            c.fill = INPUT_FILL
            c.border = BORDER
            c.font = F(10, color="0000FF" if col == 2 else "000000")
            c.alignment = CENTER if col == 2 else LEFT
        ws.cell(row=r, column=2).number_format = "0"
    ws.cell(row=STD_LAST + 2, column=1,
            value=f"입력 가능 범위: {STD_FIRST}~{STD_LAST}행 (최대 {STD_LAST - STD_FIRST + 1}개 작업 유형)").font = F(9, color="666666")
    dv = DataValidation(type="whole", operator="between", formula1="1", formula2="1440", allow_blank=True)
    dv.error = "1~1440 사이의 분(分) 단위 정수를 입력하세요."
    dv.errorTitle = "기준 소요시간"
    ws.add_data_validation(dv)
    dv.add(f"B{STD_FIRST}:B{STD_LAST}")
    ws.freeze_panes = "A5"
    ws.sheet_view.showGridLines = False
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True

    # 드롭다운용 이름: 비어 있지 않은 행까지만 (추가 행 자동 반영)
    wb.defined_names["작업유형목록"] = DefinedName(
        "작업유형목록",
        attr_text=f"OFFSET(기준시간표!$A${STD_FIRST},0,0,MAX(1,COUNTA(기준시간표!$A${STD_FIRST}:$A${STD_LAST})),1)")
    return ws


# ================================================================ 시트: 기록입력
def build_log(wb):
    ws = wb.create_sheet("기록입력")
    ws["A1"] = "기록입력 — 무리한 작업 요청을 감정이 아닌 데이터로 기록합니다"
    ws["A1"].font = F(15, True, NAVY)
    merge_write(ws, "A2:L2", "⚠ " + SAMPLE_BANNER + "  (예시 1행은 '객실 좌석 결함 점검' 대표 사례: 지수 1.75 → 위험)",
                font=F(11, True, "B42318"), fill_=BANNER_FILL, align=LEFT)
    ws.row_dimensions[2].height = 22
    ws["A3"] = "입력 칸"
    ws["A3"].fill = INPUT_FILL
    ws["A3"].border = BORDER
    ws["A3"].font = F(9, True)
    ws["A3"].alignment = CENTER
    ws.merge_cells("B3:F3")
    ws["B3"] = "← 노란 칸(A~L열)만 입력합니다. 이름은 쓰지 말고 부서/직무만."
    ws["B3"].font = F(9, color="333333")
    ws["M3"] = "자동 계산"
    ws["M3"].fill = FORMULA_FILL
    ws["M3"].border = BORDER
    ws["M3"].font = F(9, True)
    ws["M3"].alignment = CENTER
    ws.merge_cells("N3:T3")
    ws["N3"] = "← 회색 칸(M~W열)은 수식입니다. 지우거나 덮어쓰지 마세요."
    ws["N3"].font = F(9, color="333333")

    for col, head, is_input, width, desc in LOG_COLS:
        c = ws[f"{col}4"]
        c.value = head
        c.font = F(9, True, "FFFFFF")
        c.fill = HDR_INPUT_FILL if is_input else HDR_FORMULA_FILL
        c.alignment = CENTER
        c.border = BORDER
        c.comment = Comment(desc, "도구")
        ws.column_dimensions[col].width = width
    ws.row_dimensions[4].height = 46

    std_a = f"기준시간표!$A${STD_FIRST}:$A${STD_LAST}"
    std_b = f"기준시간표!$B${STD_FIRST}:$B${STD_LAST}"
    for r in range(FIRST, LAST + 1):
        f = {
            "M": f'=IF(D{r}="","",IFERROR(INDEX({std_b},MATCH(D{r},{std_a},0))+0,""))',
            "N": f'=IF(OR(B{r}="",C{r}=""),"",ROUND(MOD(C{r}-B{r},1)*1440,0))',
            "O": f'=IF(OR(B{r}="",F{r}=""),"",ROUND(MOD(F{r}-B{r},1)*1440,0))',
            "P": f'=IF(OR(M{r}="",N{r}=""),"",IF(N{r}=0,"",M{r}/N{r}))',
            "Q": f'=IF(P{r}="","",IF(P{r}>={S_DANGER},"위험",IF(P{r}>={S_CAUTION},"주의","적정")))',
            "R": (f'=IF(B{r}="","",IF(OR(HOUR(B{r})>=22,HOUR(B{r})<6),{band_cell(4)},'
                  f'IF(HOUR(B{r})<10,{band_cell(0)},IF(HOUR(B{r})<14,{band_cell(1)},'
                  f'IF(HOUR(B{r})<18,{band_cell(2)},{band_cell(3)})))))'),
            "S": f'=IF(P{r}="","",IF(P{r}>={S_DANGER},"해당",""))',
            "T": f'=IF(OR($B{r}="",G{r}=""),"",IF(G{r}>={S_STRESS},"해당",""))',
            "U": f'=IF($B{r}="","",IF(I{r}="예","해당",""))',
            "V": f'=IF($B{r}="","",IF(AND(J{r}<>"",J{r}<>"없음",K{r}="그대로 진행"),"해당",""))',
            "W": f'=IF($B{r}="","",IF(AND(H{r}<>"",H{r}<>"없음"),"해당",""))',
        }
        for col, head, is_input, width, desc in LOG_COLS:
            c = ws[f"{col}{r}"]
            c.border = BORDER
            c.fill = INPUT_FILL if is_input else FORMULA_FILL
            c.font = F(9)
            c.alignment = Alignment(horizontal="left" if col in "DL" else "center", vertical="center")
            if col in f:
                c.value = f[col]
        ws[f"A{r}"].number_format = "yyyy-mm-dd"
        for col in "BCF":
            ws[f"{col}{r}"].number_format = "hh:mm"
        ws[f"G{r}"].number_format = "0"
        for col in "MNO":
            ws[f"{col}{r}"].number_format = "0"
        ws[f"P{r}"].number_format = "0.00"

    # 가상 예시 데이터
    for i, row in enumerate(SAMPLE):
        r = FIRST + i
        (dt, req, due, task, dept, done, chg, short, ot, concern, action, memo) = row
        ws[f"A{r}"] = d(dt)
        ws[f"B{r}"] = t(req)
        ws[f"C{r}"] = t(due)
        ws[f"D{r}"] = task
        ws[f"E{r}"] = dept
        ws[f"F{r}"] = t(done)
        ws[f"G{r}"] = chg
        ws[f"H{r}"] = short
        ws[f"I{r}"] = ot
        ws[f"J{r}"] = concern
        ws[f"K{r}"] = action
        ws[f"L{r}"] = memo if memo else None

    # 데이터 유효성 검사 (드롭다운)
    def add_list(col, source, title, msg):
        dv = DataValidation(type="list", formula1=source.lstrip("="), allow_blank=True)
        dv.errorTitle = title
        dv.error = "목록에 있는 값을 선택하세요. (작업 유형은 기준시간표에 먼저 추가)"
        dv.promptTitle = title
        dv.prompt = msg
        dv.showInputMessage = True
        ws.add_data_validation(dv)
        dv.add(f"{col}{FIRST}:{col}{LAST}")

    add_list("D", "=작업유형목록", "작업 유형", "기준시간표의 작업 유형 중에서 선택")
    add_list("E", "=" + list_ref("B", len(DEPTS)), "요청 부서", "부서/직무만 선택 (이름 기록 금지)")
    add_list("H", "=" + list_ref("E", len(SHORTAGE)), "인력·공구 부족", "부족했던 자원")
    add_list("I", "=" + list_ref("C", len(YESNO)), "연장근무 중 여부", "예 / 아니오")
    add_list("J", "=" + list_ref("D", len(CONCERN)), "안전 우려 제기", "본인이 전달한 우려")
    add_list("K", "=" + list_ref("F", len(ACTION)), "요청 이후 조치", "우려 전달 후 실제 조치")

    dv_t = DataValidation(type="time", operator="between", formula1="0", formula2="0.999988", allow_blank=True)
    dv_t.errorTitle = "시각 입력"
    dv_t.error = "시각은 hh:mm 형식으로 입력하세요 (예: 13:20). 날짜는 넣지 않습니다."
    dv_t.promptTitle = "시각 입력"
    dv_t.prompt = "hh:mm (예: 13:20)"
    dv_t.showInputMessage = True
    ws.add_data_validation(dv_t)
    for col in "BCF":
        dv_t.add(f"{col}{FIRST}:{col}{LAST}")
    dv_g = DataValidation(type="whole", operator="between", formula1="0", formula2="50", allow_blank=True)
    dv_g.error = "0 이상의 정수를 입력하세요."
    dv_g.errorTitle = "요청 변경 횟수"
    ws.add_data_validation(dv_g)
    dv_g.add(f"G{FIRST}:G{LAST}")
    dv_d = DataValidation(type="date", operator="between", formula1="36526", formula2="73051", allow_blank=True)
    dv_d.error = "날짜를 yyyy-mm-dd 형식으로 입력하세요."
    dv_d.errorTitle = "날짜"
    ws.add_data_validation(dv_d)
    dv_d.add(f"A{FIRST}:A{LAST}")

    # 조건부 서식: 판정 (글자 + 색)
    qr = f"Q{FIRST}:Q{LAST}"
    ws.conditional_formatting.add(qr, CellIsRule(operator="equal", formula=['"위험"'],
                                  fill=fill("F4C7C3"), font=Font(name=FONT_NAME, bold=True, color="9B1C1C")))
    ws.conditional_formatting.add(qr, CellIsRule(operator="equal", formula=['"주의"'],
                                  fill=fill("FCE8B2"), font=Font(name=FONT_NAME, bold=True, color="7A4F01")))
    ws.conditional_formatting.add(qr, CellIsRule(operator="equal", formula=['"적정"'],
                                  fill=fill("D4EDDA"), font=Font(name=FONT_NAME, color="1E5631")))
    ws.conditional_formatting.add(f"S{FIRST}:W{LAST}", CellIsRule(operator="equal", formula=['"해당"'],
                                  fill=fill("E3D9F2"), font=Font(name=FONT_NAME, bold=True, color="4B2E83")))

    tab = Table(displayName="RecordLog", ref=f"A4:W{LAST}")
    tab.tableStyleInfo = TableStyleInfo(name="TableStyleLight1", showRowStripes=False, showColumnStripes=False)
    ws.add_table(tab)
    ws.freeze_panes = "E5"
    ws.sheet_view.zoomScale = 90

    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = "4:4"
    return ws


# ================================================================ 시트: 분석
def bar_chart(ws, title, cat_ref, val_ref, x_title, y_title, anchor, horizontal=False,
              pct=False, max_=None, width=15.5, height=7.5, num_fmt=None):
    ch = BarChart()
    ch.type = "bar" if horizontal else "col"
    ch.title = title
    ch.style = 10
    ch.add_data(val_ref, titles_from_data=False)
    ch.set_categories(cat_ref)
    ch.legend = None
    ch.roundedCorners = False
    ch.width = width
    ch.height = height
    ch.gapWidth = 60
    s = ch.series[0]
    s.graphicalProperties.solidFill = BAR_COLOR
    s.graphicalProperties.line.solidFill = BAR_COLOR
    s.dLbls = DataLabelList()
    s.dLbls.showVal = True
    s.dLbls.showSerName = False
    s.dLbls.showCatName = False
    s.dLbls.showLegendKey = False
    fmt = num_fmt or ("0%" if pct else "0")
    s.dLbls.numFmt = fmt
    ch.x_axis.title = x_title
    ch.y_axis.title = y_title
    ch.y_axis.number_format = fmt
    ch.y_axis.majorGridlines = None
    ch.y_axis.scaling.min = 0
    if max_ is not None:
        ch.y_axis.scaling.max = max_
    ch.x_axis.delete = False
    ch.x_axis.tickLblSkip = 1  # 모든 범주 이름 표시
    ch.y_axis.delete = False
    if horizontal:
        ch.x_axis.scaling.orientation = "maxMin"  # 위에서부터 순서대로
    ch.title.overlay = False
    ch.x_axis.title.overlay = False
    ch.y_axis.title.overlay = False
    ws.add_chart(ch, anchor)
    return ch


def section_title(ws, r, text, note=None):
    ws.merge_cells(f"A{r}:F{r}")
    c = ws[f"A{r}"]
    c.value = text
    c.font = F(12, True, NAVY)
    c.fill = SECTION_FILL
    c.alignment = LEFT
    for col in "BCDEF":
        ws[f"{col}{r}"].fill = SECTION_FILL
    ws.row_dimensions[r].height = 22
    if note:
        ws.merge_cells(f"A{r + 1}:F{r + 1}")
        ws[f"A{r + 1}"] = note
        ws[f"A{r + 1}"].font = F(9, color="555555")
        ws[f"A{r + 1}"].alignment = LEFT
        ws.row_dimensions[r + 1].height = 28


def header_row(ws, r, heads, start_col=1):
    for i, h in enumerate(heads):
        c = ws.cell(row=r, column=start_col + i, value=h)
        c.font = F(9, True, "FFFFFF")
        c.fill = HDR_FORMULA_FILL
        c.alignment = CENTER
        c.border = BORDER
    ws.row_dimensions[r].height = 30


def body_cell(ws, ref, value, fmt=None, bold=False, align=CENTER, color="000000"):
    c = ws[ref]
    c.value = value
    c.font = F(10, bold, color)
    c.border = BORDER
    c.alignment = align
    if fmt:
        c.number_format = fmt
    return c


PCT = "0%;-0%;0%"
IDX = "0.00"


SECTION_BREAKS = []


def build_analysis(wb):
    ws = wb.create_sheet("분석")
    set_widths(ws, {"A": 34, "B": 11, "C": 11, "D": 11, "E": 11, "F": 11, "G": 3})
    ws["A1"] = "분석 — 사람이 아니라 작업 조건과 패턴을 봅니다"
    ws["A1"].font = F(15, True, NAVY)
    ws.merge_cells("A2:F2")
    ws["A2"] = ("모든 값은 '기록입력' 시트에서 자동 계산됩니다(직접 입력하지 마세요). "
                "비율의 분모는 시간압박지수가 계산된 기록 수입니다. 기록이 적은 항목의 비율은 크게 흔들리니 건수도 함께 보세요.")
    ws["A2"].font = F(9, color="555555")
    ws["A2"].alignment = LEFT
    ws.row_dimensions[2].height = 30

    P, Q, R, D, E, J = rng("P"), rng("Q"), rng("R"), rng("D"), rng("E"), rng("J")
    B = rng("B")

    # ---- 핵심 지표
    r = 4
    section_title(ws, r, "1. 핵심 지표")
    header_row(ws, r + 1, ["지표", "값", "비율"])
    ws.merge_cells(f"D{r + 1}:F{r + 1}")
    ws[f"D{r + 1}"] = "설명"
    style_range(ws, f"D{r + 1}:F{r + 1}", border=BORDER, fill_=HDR_FORMULA_FILL, font=F(9, True, "FFFFFF"), align=CENTER)
    kpis = [
        ("총 기록 건수", f"=COUNT({B})", None, "0", "요청 접수 시각이 입력된 행"),
        ("지수 계산 건수", f"=COUNT({P})", None, "0", "작업 유형·시각이 모두 있어 지수가 나온 행"),
        ("평균 시간압박지수", f'=IF(COUNT({P})=0,"",AVERAGE({P}))', None, IDX, "1.0 이상이면 평균적으로 기준보다 시간이 부족"),
        ("위험 건수", f'=IF(COUNT({P})=0,"",COUNTIF({Q},"위험"))',
         '=IF(COUNT({P})=0,"",B9/B7)', "0", "지수 ≥ 위험 기준 (비율 = 위험 ÷ 지수 계산 건수)"),
        ("주의 건수", f'=IF(COUNT({P})=0,"",COUNTIF({Q},"주의"))',
         '=IF(COUNT({P})=0,"",B10/B7)', "0", "주의 기준 ≤ 지수 < 위험 기준"),
        ("안전 우려 제기 건수", f'=IF(COUNT({B})=0,"",COUNTIFS({J},"<>",{J},"<>없음"))',
         None, "0", "'안전 우려 제기'가 비어 있지 않고 '없음'이 아닌 기록"),
        ('우려 제기 후 "그대로 진행"', f'=IF(COUNT({B})=0,"",COUNTIF({rng("V")},"해당"))',
         '=IF(N(B11)=0,"",B12/B11)', "0", "비율 = 그대로 진행 ÷ 안전 우려 제기 건수 (의사소통 부족 신호)"),
    ]
    for i, (label, fv, fr, fmt, desc) in enumerate(kpis):
        rr = r + 2 + i
        body_cell(ws, f"A{rr}", label, align=LEFT, bold=True)
        body_cell(ws, f"B{rr}", fv, fmt=fmt, bold=True)
        body_cell(ws, f"C{rr}", fr.replace("{P}", P) if fr else None, fmt=PCT, bold=True)
        ws.merge_cells(f"D{rr}:F{rr}")
        body_cell(ws, f"D{rr}", desc, align=LEFT, color="444444")
        ws[f"D{rr}"].font = F(8, color="444444")
        style_range(ws, f"D{rr}:F{rr}", border=BORDER)
        ws[f"A{rr}"].fill = KPI_FILL
        ws.row_dimensions[rr].height = 24
    assert r + 2 + 3 == 9 and r + 2 + 5 == 11  # B7 = 지수 계산 건수, B9 위험, B10 주의, B11 우려, B12 그대로

    # ---- 2. 시간대
    r = 16
    section_title(ws, r, "2. 시간대별 (요청 접수 시각 기준)",
                  "특정 시간대(예: 오후 턴어라운드)에 압박이 몰리는지 확인합니다.")
    hr = r + 2
    header_row(ws, hr, ["시간대", "건수", "평균 지수", "위험 건수", "위험 비율"])
    band_rows = []
    for i in range(len(BANDS)):
        rr = hr + 1 + i
        band_rows.append(rr)
        body_cell(ws, f"A{rr}", f"={band_cell(i)}", bold=True)
        body_cell(ws, f"B{rr}", f'=IF(COUNT({B})=0,"",COUNTIF({R},A{rr}))', "0")
        body_cell(ws, f"C{rr}", f'=IFERROR(AVERAGEIFS({P},{R},A{rr}),"")', IDX)
        body_cell(ws, f"D{rr}", f'=IF(COUNT({B})=0,"",COUNTIFS({R},A{rr},{Q},"위험"))', "0")
        body_cell(ws, f"E{rr}", f'=IF(COUNTIFS({R},A{rr},{P},">=0")=0,"",D{rr}/COUNTIFS({R},A{rr},{P},">=0"))', PCT)
    BAND_FIRST, BAND_LAST = band_rows[0], band_rows[-1]
    bar_chart(ws, "시간대별 위험 비율",
              Reference(ws, min_col=1, min_row=BAND_FIRST, max_row=BAND_LAST),
              Reference(ws, min_col=5, min_row=BAND_FIRST, max_row=BAND_LAST),
              "요청 접수 시간대", "위험 비율", f"H{r}", pct=True, max_=1, height=7.2)

    # ---- 3. 작업 유형
    r = 33
    SECTION_BREAKS.append(r)
    section_title(ws, r, "3. 작업 유형별",
                  "위: 위험 비율이 높은 순 상위 10개(차트용, 자동 정렬). 아래: 전체 작업 유형 표.")
    tr = r + 2
    header_row(ws, tr, ["작업 유형 (위험 비율 상위 10)", "위험 비율", "건수"])
    n_std = STD_LAST - STD_FIRST + 1
    full_hr = tr + 12          # 전체 표 머리글 행
    full_first = full_hr + 1
    full_last = full_first + n_std - 1
    names = f"$A${full_first}:$A${full_last}"
    scores = f"$F${full_first}:$F${full_last}"
    top_rows = []
    for k in range(1, 11):
        rr = tr + k
        top_rows.append(rr)
        m = f"MATCH(LARGE({scores},{k}),{scores},0)"
        body_cell(ws, f"A{rr}", f'=IF(LARGE({scores},{k})<0,"",INDEX({names},{m}))', align=LEFT)
        body_cell(ws, f"B{rr}", f'=IF(A{rr}="","",INDEX($E${full_first}:$E${full_last},{m}))', PCT)
        body_cell(ws, f"C{rr}", f'=IF(A{rr}="","",INDEX($B${full_first}:$B${full_last},{m}))', "0")
    bar_chart(ws, "작업 유형별 위험 비율 (상위 10)",
              Reference(ws, min_col=1, min_row=top_rows[0], max_row=top_rows[-1]),
              Reference(ws, min_col=2, min_row=top_rows[0], max_row=top_rows[-1]),
              "작업 유형", "위험 비율", f"H{r}", horizontal=True, pct=True, max_=1, height=8.5)

    ws[f"A{full_hr - 1}"] = "전체 작업 유형 (기준시간표 순서)"
    ws[f"A{full_hr - 1}"].font = F(10, True, NAVY)
    header_row(ws, full_hr, ["작업 유형", "건수", "평균 지수", "위험 건수", "위험 비율", "(정렬용 점수)"])
    for i in range(n_std):
        rr = full_first + i
        sr = STD_FIRST + i
        body_cell(ws, f"A{rr}", f'=IF(기준시간표!$A${sr}="","",기준시간표!$A${sr})', align=LEFT)
        body_cell(ws, f"B{rr}", f'=IF(OR(A{rr}="",COUNT({B})=0),"",COUNTIF({D},A{rr}))', "0")
        body_cell(ws, f"C{rr}", f'=IF(A{rr}="","",IFERROR(AVERAGEIFS({P},{D},A{rr}),""))', IDX)
        body_cell(ws, f"D{rr}", f'=IF(OR(A{rr}="",COUNT({B})=0),"",COUNTIFS({D},A{rr},{Q},"위험"))', "0")
        body_cell(ws, f"E{rr}", f'=IF(A{rr}="","",IF(COUNTIFS({D},A{rr},{P},">=0")=0,"",D{rr}/COUNTIFS({D},A{rr},{P},">=0")))', PCT)
        # 정렬용: 위험 비율 + 건수 가중(동률 시 건수 많은 쪽) - 행 번호 미세값(완전 동률 방지)
        body_cell(ws, f"F{rr}",
                  f'=IF(A{rr}="",-2-ROW()/1000000,IF(E{rr}="",-1-ROW()/1000000,E{rr}+B{rr}/100000-ROW()/1000000000))',
                  "0.000;;;", color="999999")
        ws[f"F{rr}"].font = F(8, color="999999")
    ws[f"F{full_hr}"].comment = Comment("상위 10 자동 정렬에 쓰는 보조 값입니다. 수정하지 마세요.", "도구")
    TASK_FIRST, TASK_LAST = full_first, full_last

    # ---- 4. 요청 부서
    r = full_last + 2
    SECTION_BREAKS.append(r)
    section_title(ws, r, "4. 요청 부서별",
                  "부서를 비난하기 위한 표가 아닙니다. 어느 요청 경로에서 작업 조건 조율이 필요한지 봅니다.")
    hr = r + 2
    header_row(ws, hr, ["요청 부서", "건수", "평균 지수", "위험 건수", "위험 비율"])
    dept_rows = []
    for i in range(len(DEPTS)):
        rr = hr + 1 + i
        dept_rows.append(rr)
        body_cell(ws, f"A{rr}", f"={list_ref('B', len(DEPTS)).split(':')[0]}".replace(f"${LIST_ROW0}", f"${LIST_ROW0 + i}"), bold=True)
        body_cell(ws, f"B{rr}", f'=IF(COUNT({B})=0,"",COUNTIF({E},A{rr}))', "0")
        body_cell(ws, f"C{rr}", f'=IFERROR(AVERAGEIFS({P},{E},A{rr}),"")', IDX)
        body_cell(ws, f"D{rr}", f'=IF(COUNT({B})=0,"",COUNTIFS({E},A{rr},{Q},"위험"))', "0")
        body_cell(ws, f"E{rr}", f'=IF(COUNTIFS({E},A{rr},{P},">=0")=0,"",D{rr}/COUNTIFS({E},A{rr},{P},">=0"))', PCT)
    bar_chart(ws, "요청 부서별 위험 비율",
              Reference(ws, min_col=1, min_row=dept_rows[0], max_row=dept_rows[-1]),
              Reference(ws, min_col=5, min_row=dept_rows[0], max_row=dept_rows[-1]),
              "요청 부서", "위험 비율", f"H{r}", pct=True, max_=1, height=7.2)

    # ---- 5. 인적요소
    r = r + 17
    section_title(ws, r, "5. 인적요소(Human Factors) 해당 건수",
                  "기록입력의 규칙으로 자동 판정합니다. 한 기록이 여러 요인에 동시에 해당할 수 있습니다.")
    hr = r + 2
    header_row(ws, hr, ["인적요소", "해당 건수", "기록 대비"])
    ws.merge_cells(f"D{hr}:F{hr}")
    ws[f"D{hr}"] = "판정 규칙"
    style_range(ws, f"D{hr}:F{hr}", border=BORDER, fill_=HDR_FORMULA_FILL, font=F(9, True, "FFFFFF"), align=CENTER)
    fac_rows = []
    for i, (name, col, rule) in enumerate(FACTORS):
        rr = hr + 1 + i
        fac_rows.append(rr)
        body_cell(ws, f"A{rr}", name, align=LEFT, bold=True)
        body_cell(ws, f"B{rr}", f'=IF(COUNT({B})=0,"",COUNTIF({rng(col)},"해당"))', "0")
        body_cell(ws, f"C{rr}", f'=IF(COUNT({B})=0,"",B{rr}/COUNT({B}))', PCT)
        ws.merge_cells(f"D{rr}:F{rr}")
        body_cell(ws, f"D{rr}", rule, align=LEFT)
        ws[f"D{rr}"].font = F(8, color="444444")
        style_range(ws, f"D{rr}:F{rr}", border=BORDER)
        ws.row_dimensions[rr].height = 24
    bar_chart(ws, "인적요소별 해당 건수",
              Reference(ws, min_col=1, min_row=fac_rows[0], max_row=fac_rows[-1]),
              Reference(ws, min_col=2, min_row=fac_rows[0], max_row=fac_rows[-1]),
              "인적요소", "해당 건수", f"H{r}", horizontal=True, height=8.5, width=17)
    FAC_FIRST, FAC_LAST = fac_rows[0], fac_rows[-1]

    # ---- 6. 기준 대비 실제
    r = r + 17
    SECTION_BREAKS.append(r)
    section_title(ws, r, "6. 기준 대비 실제 소요시간 (작업 유형별)",
                  "비율 = 평균 실제 소요시간 ÷ 평균 기준 소요시간. 실제 완료 시각이 입력된 기록만 사용합니다. "
                  "1보다 크게 높으면 내 기준시간표가 현실보다 짧은 것이니 기준을 다시 검토하세요.")
    ws.row_dimensions[r + 1].height = 40
    hr = r + 2
    header_row(ws, hr, ["작업 유형", "실제 입력 건수", "평균 기준(분)", "평균 실제(분)", "실제÷기준", "해석"])
    O = rng("O")
    M = rng("M")
    for i in range(n_std):
        rr = hr + 1 + i
        body_cell(ws, f"A{rr}", f"=A{TASK_FIRST + i}", align=LEFT)
        body_cell(ws, f"B{rr}", f'=IF(OR(A{rr}="",COUNT({B})=0),"",COUNTIFS({D},A{rr},{O},">=0"))', "0")
        body_cell(ws, f"C{rr}", f'=IF(N(B{rr})=0,"",AVERAGEIFS({M},{D},A{rr},{O},">=0"))', "0.0")
        body_cell(ws, f"D{rr}", f'=IF(N(B{rr})=0,"",AVERAGEIFS({O},{D},A{rr},{O},">=0"))', "0.0")
        body_cell(ws, f"E{rr}", f'=IF(OR(C{rr}="",N(C{rr})=0),"",D{rr}/C{rr})', IDX)
        body_cell(ws, f"F{rr}",
                  f'=IF(E{rr}="","",IF(E{rr}>={S_REAL_HI},"기준이 짧음",IF(E{rr}<{S_REAL_LO},"기준이 넉넉함","현실적")))')
    ws.column_dimensions["F"].width = 12
    last_row = hr + n_std

    ws.sheet_view.showGridLines = False
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_area = f"A1:Q{last_row}"
    for br in SECTION_BREAKS:  # 인쇄 시 섹션 단위로 페이지 나눔
        ws.row_breaks.append(Break(id=br - 1))
    return {"band": (BAND_FIRST, BAND_LAST), "task": (TASK_FIRST, TASK_LAST), "fac": (FAC_FIRST, FAC_LAST)}


# ================================================================ 시트: 보고서
def build_report(wb, pos):
    ws = wb.create_sheet("보고서")
    set_widths(ws, {"A": 31, "B": 22, "C": 18, "D": 22})
    bf, bl = pos["band"]
    tf, tl = pos["task"]
    ff, fl = pos["fac"]

    ws.merge_cells("A1:D1")
    ws["A1"] = "정비 작업조건 개선 보고 — 업무 압박 기록 요약"
    ws["A1"].font = F(16, True, NAVY)
    ws["A1"].alignment = LEFT
    ws.row_dimensions[1].height = 30
    ws.merge_cells("A2:D2")
    ws["A2"] = GUIDE_SENTENCE
    ws["A2"].font = F(10, True, "1E5631")
    ws["A2"].fill = fill("E8F3EC")
    ws["A2"].alignment = LEFT
    ws.row_dimensions[2].height = 22
    ws.merge_cells("A3:D3")
    ws["A3"] = "작성 부서/직무: ____________    작성일: ____________    (개인 이름·기번·회사명은 적지 않습니다)"
    ws["A3"].font = F(9, color="555555")

    A = "분석!"
    B = rng("B")
    Adates = rng("A")
    rows = [
        ("기록 기간",
         f'=IF(COUNT({Adates})=0,"",TEXT(MIN({Adates}),"yyyy-mm-dd")&" ~ "&TEXT(MAX({Adates}),"yyyy-mm-dd"))', None),
        ("기록 건수", f'=IF({A}B6=0,"",{A}B6&"건 (지수 계산 "&{A}B7&"건)")', None),
        ("평균 시간압박지수", f'=IF({A}B8="","",TEXT({A}B8,"0.00"))', None),
        ("위험 / 주의 건수",
         f'=IF({A}B7=0,"","위험 "&{A}B9&"건 ("&TEXT({A}C9,"0%")&") / 주의 "&{A}B10&"건 ("&TEXT({A}C10,"0%")&")")', None),
        ("위험 비율이 가장 높은 시간대",
         f'=IF({A}B7=0,"",IF(MAX({A}$E${bf}:$E${bl})=0,"위험 판정 없음",'
         f'INDEX({A}$A${bf}:$A${bl},MATCH(MAX({A}$E${bf}:$E${bl}),{A}$E${bf}:$E${bl},0))'
         f'&"  (위험 비율 "&TEXT(MAX({A}$E${bf}:$E${bl}),"0%")&", 해당 시간대 "'
         f'&INDEX({A}$B${bf}:$B${bl},MATCH(MAX({A}$E${bf}:$E${bl}),{A}$E${bf}:$E${bl},0))&"건)"))', None),
        ("위험 비율이 가장 높은 작업 유형",
         f'=IF({A}B7=0,"",IF(MAX({A}$E${tf}:$E${tl})=0,"위험 판정 없음",'
         f'INDEX({A}$A${tf}:$A${tl},MATCH(MAX({A}$E${tf}:$E${tl}),{A}$E${tf}:$E${tl},0))'
         f'&"  (위험 비율 "&TEXT(MAX({A}$E${tf}:$E${tl}),"0%")&", "'
         f'&INDEX({A}$B${tf}:$B${tl},MATCH(MAX({A}$E${tf}:$E${tl}),{A}$E${tf}:$E${tl},0))&"건)"))', None),
        ("가장 많이 나타난 인적요소",
         f'=IF({A}B6=0,"",IF(MAX({A}$B${ff}:$B${fl})=0,"해당 없음",'
         f'INDEX({A}$A${ff}:$A${fl},MATCH(MAX({A}$B${ff}:$B${fl}),{A}$B${ff}:$B${fl},0))'
         f'&"  ("&MAX({A}$B${ff}:$B${fl})&"건)"))', None),
        ('안전 우려 제기 후 "그대로 진행"',
         f'=IF({A}B6=0,"",IF(N({A}B11)=0,"우려 제기 기록 없음","우려 제기 "&{A}B11&"건 중 "&{A}B12&"건 ("&TEXT({A}C12,"0%")&")"))', None),
    ]
    r0 = 5
    ws[f"A{r0}"] = "1. 기록 요약 (자동)"
    ws[f"A{r0}"].font = F(12, True, NAVY)
    for i, (label, f, _) in enumerate(rows):
        rr = r0 + 1 + i
        c = ws[f"A{rr}"]
        c.value = label
        c.font = F(10, True)
        c.fill = KPI_FILL
        c.alignment = LEFT
        ws.merge_cells(f"B{rr}:D{rr}")
        ws[f"B{rr}"] = f
        ws[f"B{rr}"].font = F(10)
        ws[f"B{rr}"].alignment = LEFT
        style_range(ws, f"A{rr}:D{rr}", border=BORDER)
        ws.row_dimensions[rr].height = 22
    rr = r0 + 1 + len(rows)
    ws.merge_cells(f"A{rr}:D{rr}")
    ws[f"A{rr}"] = ("※ 시간압박지수 = 기준 소요시간 ÷ 주어진 시간.  판정: 주의 기준·위험 기준은 '설정' 시트 값(수업용 예시)을 따릅니다. "
                    "건수가 적은 항목의 비율은 해석에 주의하세요.")
    ws[f"A{rr}"].font = F(8, color="555555")
    ws[f"A{rr}"].alignment = LEFT
    ws.row_dimensions[rr].height = 26
    # 기준값 표시 행
    rr += 1
    ws.merge_cells(f"A{rr}:D{rr}")
    ws[f"A{rr}"] = (f'="현재 기준: 적정 < "&TEXT({S_CAUTION},"0.00")&" ≤ 주의 < "&TEXT({S_DANGER},"0.00")&" ≤ 위험"')
    ws[f"A{rr}"].font = F(8, color="555555")

    rr += 2
    ws[f"A{rr}"] = "2. 학습자 작성 (직접 입력)"
    ws[f"A{rr}"].font = F(12, True, NAVY)
    boxes = [
        ("관찰된 사실", "기록에서 확인된 사실만 씁니다. 예: 14-18시 휠/브레이크 점검 요청의 위험 비율이 높았다."),
        ("안전 영향", "그 조건이 계속되면 어떤 안전 위험이 생길 수 있는지 씁니다 (예: 절차 생략, 점검 누락 가능성)."),
        ("개선 제안", "조건을 바꾸는 제안을 씁니다. 예: 적정 작업시간 확보, 요청 절차 개선, 인력 재배치 등."),
    ]
    box_h = 7
    for title, hint in boxes:
        rr += 1
        ws[f"A{rr}"] = title
        ws[f"A{rr}"].font = F(11, True, "FFFFFF")
        ws[f"A{rr}"].fill = HDR_INPUT_FILL
        ws[f"A{rr}"].alignment = LEFT
        ws.merge_cells(f"B{rr}:D{rr}")
        ws[f"B{rr}"] = hint
        ws[f"B{rr}"].font = F(8, italic=True, color="555555")
        ws[f"B{rr}"].alignment = LEFT
        style_range(ws, f"A{rr}:D{rr}", border=BORDER)
        ws.row_dimensions[rr].height = 28
        rr += 1
        ref = f"A{rr}:D{rr + box_h - 1}"
        ws.merge_cells(ref)
        ws[f"A{rr}"].alignment = WRAP_TOP
        ws[f"A{rr}"].font = F(10)
        style_range(ws, ref, border=BOX_BORDER, fill_=INPUT_FILL)
        for k in range(box_h):
            ws.row_dimensions[rr + k].height = 18
        rr += box_h - 1
    rr += 2
    ws.merge_cells(f"A{rr}:D{rr}")
    ws[f"A{rr}"] = ("이 보고서는 특정 개인이나 부서의 잘못을 따지기 위한 것이 아니라, 반복되는 작업 조건을 개선하기 위한 자료입니다. "
                    "외부 공유·AI 도구 사용 전 회사명·항공기 등록부호·개인 이름을 지우고 회사 보안 정책을 따르세요.")
    ws[f"A{rr}"].font = F(8, color="555555")
    ws[f"A{rr}"].alignment = LEFT
    ws.row_dimensions[rr].height = 30

    ws.sheet_view.showGridLines = False
    ws.page_setup.orientation = "portrait"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_options.horizontalCentered = True
    ws.page_margins.left = ws.page_margins.right = 0.5
    ws.page_margins.top = ws.page_margins.bottom = 0.6
    ws.print_area = f"A1:D{rr}"
    return ws


# ================================================================ 시트: 사용법
def build_guide(ws):
    ws.title = "사용법"
    set_widths(ws, {"A": 2, "B": 38, "C": 86})
    ws.sheet_view.showGridLines = False
    r = 1
    ws["B1"] = "업무 압박 기록·분석 도구 — 사용법"
    ws["B1"].font = F(16, True, NAVY)
    ws["B2"] = "항공정비일반 12주차 · 항공정비 인적요소(Human Factors)"
    ws["B2"].font = F(10, color="555555")

    merge_write(ws, "B4:C4", "⚠ " + SAMPLE_BANNER + "  — '기록입력' 시트의 40여 행은 수업 토론용으로 만든 가상 기록입니다.",
                font=F(11, True, "B42318"), fill_=BANNER_FILL, align=LEFT, border=BORDER)
    ws.row_dimensions[4].height = 24
    merge_write(ws, "B5:C5", GUIDE_SENTENCE, font=F(11, True, "1E5631"), fill_=fill("E8F3EC"), align=LEFT, border=BORDER)
    ws.row_dimensions[5].height = 24

    def heading(row, text):
        ws[f"B{row}"] = text
        ws[f"B{row}"].font = F(12, True, NAVY)
        ws.row_dimensions[row].height = 22

    def para(row, text, h=None):
        ws.merge_cells(f"B{row}:C{row}")
        ws[f"B{row}"] = text
        ws[f"B{row}"].font = F(10)
        ws[f"B{row}"].alignment = WRAP_TOP
        if h:
            ws.row_dimensions[row].height = h

    def kv(row, k, v, h=None, kfill=None):
        ws[f"B{row}"] = k
        ws[f"C{row}"] = v
        ws[f"B{row}"].font = F(10, True)
        ws[f"C{row}"].font = F(10)
        ws[f"B{row}"].alignment = WRAP_TOP
        ws[f"C{row}"].alignment = WRAP_TOP
        ws[f"B{row}"].border = BORDER
        ws[f"C{row}"].border = BORDER
        if kfill:
            ws[f"B{row}"].fill = kfill
        if h:
            ws.row_dimensions[row].height = h

    r = 7
    heading(r, "1. 목적")
    r += 1
    para(r, "현장(정비사)과 사무직(정비계획·운항관리 등)은 같은 목표를 갖고 있지만 일을 보는 관점이 다릅니다. "
            "\"이거 20분 안에 끝내주세요\" 같은 무리한 요청을 받았을 때 감정적으로 불만을 말하는 대신, "
            "요청 시각·요구 시간·기준 시간·실제 결과를 기록합니다. 기록이 쌓이면 어떤 시간대·작업·조건에서 압박이 반복되는지 "
            "보이고, 이것이 조직의 안전 개선을 요청하는 근거가 됩니다. 이 도구는 사람이 아니라 작업 조건과 패턴을 분석합니다. "
            "그래서 요청자 이름을 적는 칸은 없고, 부서/직무만 기록합니다.", 78)

    r += 2
    heading(r, "2. 3단계 흐름: 기록 → 분석 → 제안")
    steps = [
        ("① 기록 (기록입력 시트)", "요청을 받을 때마다 한 행씩 입력합니다. 노란 칸만 입력하고, 회색 칸은 자동 계산됩니다. "
                                "먼저 '기준시간표'의 예시 값을 본인 기준으로 바꾸세요."),
        ("② 분석 (분석 시트)", "입력과 동시에 시간대·작업 유형·요청 부서·인적요소별 표와 차트가 갱신됩니다. "
                             "어디에 압박이 몰리는지, 내 기준시간이 현실적인지 확인합니다."),
        ("③ 제안 (보고서 시트)", "요약이 자동으로 채워집니다. 아래 세 칸(관찰된 사실 / 안전 영향 / 개선 제안)을 직접 작성해 "
                              "감독자나 안전보고 채널에 제출합니다. A4 세로 한 장으로 인쇄됩니다."),
    ]
    for k, v in steps:
        r += 1
        kv(r, k, v, 34, SECTION_FILL)

    r += 2
    heading(r, "3. 기록입력 시트 — 열별 설명")
    r += 1
    kv(r, "열 / 머리글", "구분 · 설명", None, HDR_FORMULA_FILL)
    ws[f"B{r}"].font = F(10, True, "FFFFFF")
    ws[f"C{r}"].fill = HDR_FORMULA_FILL
    ws[f"C{r}"].font = F(10, True, "FFFFFF")
    for col, head, is_input, width, desc in LOG_COLS:
        r += 1
        kv(r, f"{col}  {head}", ("[입력] " if is_input else "[자동] ") + desc, 20 if len(desc) < 60 else 32,
           INPUT_FILL if is_input else FORMULA_FILL)

    r += 2
    heading(r, "4. 시간압박지수와 판정 기준")
    r += 1
    para(r, "시간압박지수 = 기준 소요시간(분) ÷ 주어진 시간(분)\n"
            "· 주어진 시간 = 요구 완료 시각 − 요청 접수 시각. 야간 근무처럼 자정을 넘기면 MOD(요구완료 − 요청접수, 1)로 계산하므로 "
            "23:50 접수 → 00:40 완료 요구는 50분으로 계산됩니다.\n"
            "· 1.0 = 기준 시간만큼 시간이 주어짐.  1.75 = 기준보다 75% 더 많은 일을 같은 시간에 요구받음.\n"
            "· 대표 예시: 객실 좌석 결함 점검(기준 35분)을 13:00에 받고 13:20까지 요구 → 주어진 시간 20분 → 35 ÷ 20 = 1.75 → 위험.", 86)
    r += 1
    kv(r, "판정 (기본값)", "지수 < 0.8 → 적정    |    0.8 이상 1.0 미만 → 주의    |    1.0 이상 → 위험\n"
                        "판정 칸은 색과 함께 글자(적정/주의/위험)로 표시되므로 흑백 인쇄에서도 읽을 수 있습니다.", 34)
    r += 1
    kv(r, "인적요소 판정 규칙", "압박(Pressure): 지수 ≥ 위험 기준(1.0)\n"
                         "스트레스(Stress): 요청 변경 횟수 ≥ 2\n"
                         "피로(Fatigue): 연장근무 중 = 예\n"
                         "의사소통 부족(Lack of Communication): 안전 우려를 제기했는데 조치가 '그대로 진행'\n"
                         "자원 부족(Lack of Resources): 인력·공구 부족 ≠ 없음", 82)
    r += 1
    kv(r, "기준값 바꾸기", "0.8 / 1.0 / 2 등 기준값은 '설정' 시트의 노란 칸(C5~C9)에 있습니다. 값을 바꾸면 모든 판정과 분석이 다시 계산됩니다. "
                      "수업에서 \"우리 현장에서는 어디부터 위험인가?\"를 토론한 뒤 조정해 보세요.", 34)

    r += 2
    heading(r, "5. 꼭 읽어 주세요")
    notices = [
        "(가) 기준값은 수업용 예시입니다. 0.8·1.0 같은 판정 기준과 기준시간표의 분(分) 값은 법규나 규정상의 기준이 아닙니다. "
        "각 작업장은 자기 회사의 정비 교범·작업카드·현장 경험을 근거로 '기준 소요시간'을 직접 정해야 합니다.",
        "(나) 사람이 아니라 사실과 시각을 기록합니다. 요청자 이름, 누구 탓인지에 대한 평가는 쓰지 않습니다. "
        "부서/직무, 시각, 작업, 조치만 남깁니다.",
        "(다) 기록을 AI 도구(챗봇 등)에 붙여넣기 전에 회사명, 항공기 등록부호(기번), 개인 이름을 반드시 지우고, "
        "소속 회사의 정보보안 정책을 따르세요. 외부 공유도 같습니다.",
    ]
    for text in notices:
        r += 1
        merge_write(ws, f"B{r}:C{r}", text, font=F(10, True, "7A3E00"), fill_=NOTICE_FILL, align=WRAP_TOP, border=BOX_BORDER)
        ws.row_dimensions[r].height = 46

    r += 2
    heading(r, "6. 처음 사용할 때")
    r += 1
    para(r, "1) 기록입력 시트의 가상 예시 데이터(5행부터 노란 칸 A~L열)를 선택해 내용만 지웁니다(Delete 키). 회색 수식 칸은 지우지 않습니다.\n"
            "2) 기준시간표의 예시 값을 본인 기준으로 바꾸고, 필요한 작업 유형은 빈 행에 추가합니다.\n"
            "3) 요청을 받을 때마다 기록합니다. 최대 500행까지 입력할 수 있습니다.\n"
            "4) 2~4주 기록이 쌓이면 분석·보고서 시트를 확인하고 보고서의 세 칸을 작성합니다.\n"
            "※ 이 파일은 매크로가 없으며 Excel 2016 이상과 LibreOffice에서 동작합니다.", 92)
    ws.page_setup.orientation = "portrait"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True


# ================================================================ main
def main(out):
    wb = Workbook()
    guide = wb.active
    build_guide(guide)
    build_standard(wb)
    build_log(wb)
    pos = build_analysis(wb)
    build_report(wb, pos)
    build_settings(wb)
    for ws in wb.worksheets:
        ws.sheet_properties.tabColor = {"사용법": "1F3A5F", "기준시간표": "B8860B", "기록입력": "B8860B",
                                        "분석": "4A5A6A", "보고서": "1E5631", "설정": "7F8C99"}[ws.title]
    wb.active = 0
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    wb.save(out)
    print("saved", out)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT)
