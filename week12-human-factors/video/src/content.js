// 화면에 나오는 모든 문자열과 색상
export const C = {
  navy: '#1B2A4A', navy2: '#2C3E66', navy3: '#3E527A', white: '#FFFFFF', paper: '#F6F8FB',
  sky: '#DCE5EF', gb1: '#E6EDF5', gb2: '#C3CFDD', gb3: '#8FA3BD', gb4: '#6F84A3',
  yellow: '#F5B800', red: '#D63A3A', vest: '#D6EC3A', skin: '#E5C19D', ground: '#CAD3DE',
  calm: '#7FA6D6'
};

// ---------------------------------------------------------------- 문자열 (모두 여기서 관리)
export const STR = {
  clock: '13:00',
  bubble: '20분 안에 끝내주세요.',
  bar35: ['기준 소요시간', '35분'],
  bar20: ['주어진 시간', '20분'],
  gap: '15분 차이',
  ticks: ['0', '0.8', '1.0', '2.0'],
  readout: ['1.75', '위험'],
  rec: [['요청 접수', '13:00'], ['요구 완료', '13:20'], ['기준', '35분'], ['실제 완료', '13:42'],
        ['요청 변경', '2회'], ['안전 우려', '시간 부족 전달'], ['조치', '완료시간 재협의']],
  cats: ['06-10시', '10-14시', '14-18시', '18-22시', '22-06시'],
  pct: [0, 11, 71, 0, 0],
  axis: ['0%', '25%', '50%', '75%', '100%'],
  tiles: [['압박', 'Pressure'], ['스트레스', 'Stress'], ['피로', 'Fatigue'],
          ['의사소통 부족', 'Lack of Communication'], ['자원 부족', 'Lack of Resources']],
  report: ['관찰된 사실', '안전 영향', '개선 제안'],
  ai: ['기록 정리', '패턴 찾기', '사실 중심으로 전달'],
  board: ['06', '08', '10', '12', '14', '16', '18'],
  misc: '0123456789%:.,-'
};

// ---------------------------------------------------------------- 화면 자막 (HTML 오버레이)
// slot 이 같은 자막은 시간이 겹치지 않는다 (checkCaptions 에서 검사)
export const CAPS = [
  { cls: 'scrim', slot: 'scrim', a: 0.4, b: 7.7 },
  { cls: 'tag', slot: 'tag', text: '항공정비 인적요소(휴먼팩터)', a: 0.8, b: 7.6 },
  { cls: 'title', slot: 'title', html: '현장직과 사무직,<br><span class="hl">업무 압박을 데이터로</span> 확인하는 법', text: '현장직과 사무직, 업무 압박을 데이터로 확인하는 법', a: 1.3, b: 7.6 },
  { cls: 'course', slot: 'course', text: '항공정비일반 · 12주차', a: 1.9, b: 7.6 },
  { cls: 'bottom', slot: 'bottom', text: '현장직: 실제 작업시간과 안전', a: 9.0, b: 13.5 },
  { cls: 'bottom', slot: 'bottom', text: '사무직: 일정과 운영', a: 14.2, b: 18.0 },
  { cls: 'bottom', slot: 'bottom', text: '목표는 같고, 잣대가 다릅니다.', a: 18.5, b: 22.5 },
  { cls: 'chip', slot: 'chip', html: '<small>작업 요청</small>객실 좌석 결함 점검', text: '작업 요청 객실 좌석 결함 점검', a: 24.0, b: 35.6 },
  { cls: 'top', slot: 'top', text: '시간압박지수 = 기준 소요시간 ÷ 주어진 시간', a: 36.6, b: 47.6 },
  { cls: 'top2', slot: 'top2', html: '35 ÷ 20 = <span class="hi">1.75</span>', text: '35 ÷ 20 = 1.75', a: 39.2, b: 47.6 },
  { cls: 'legend', slot: 'legend', html: `<span><i style="background:${C.calm}"></i>적정 (0.8 미만)</span><span><i style="background:${C.yellow}"></i>주의 (0.8 이상 1.0 미만)</span><span><i style="background:${C.red}"></i>위험 (1.0 이상)</span>`, text: '적정 (0.8 미만) 주의 (0.8 이상 1.0 미만) 위험 (1.0 이상)', a: 37.8, b: 47.6 },
  { cls: 'note', slot: 'note', text: '수업용 기준값이며 규정이 아닙니다.', a: 43.0, b: 47.6 },
  { cls: 'top', slot: 'top', text: '감정이 아니라 기록으로', a: 48.6, b: 61.8 },
  { cls: 'bottom', slot: 'bottom', text: '사람 이름은 적지 않습니다. 작업 조건만 적습니다.', a: 56.0, b: 61.8 },
  { cls: 'bottom', slot: 'bottom', text: '기록이 쌓이면 패턴이 보입니다.', a: 63.0, b: 75.6 },
  { cls: 'top', slot: 'top', text: '시간대별 위험 비율 (가상 예시 데이터)', a: 67.6, b: 75.6 },
  { cls: 'bottom', slot: 'bottom', text: '업무 압박은 인적요소 위험요인과 연결됩니다.', a: 81.0, b: 87.6 },
  { cls: 'bottom', slot: 'bottom', text: 'AI는 초안을 돕고, 판단과 책임은 정비사에게 있습니다.', a: 95.4, b: 101.6 },
  { cls: 'dim', slot: 'dim', a: 105.4, b: 999 },
  { cls: 'full', slot: 'full', html: '<div class="bar"></div><div>핵심은 누구의 잘못을 찾는 것이 아니라,<br><span class="y">안전하게 정비할 수 있는 작업 조건</span>을 만드는 것입니다.</div>', text: '핵심은 누구의 잘못을 찾는 것이 아니라, 안전하게 정비할 수 있는 작업 조건을 만드는 것입니다.', a: 105.8, b: 999 }
];

