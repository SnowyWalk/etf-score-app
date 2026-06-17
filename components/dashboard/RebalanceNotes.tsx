import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function RebalanceNotes() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>리밸런싱 기준</CardTitle>
        <CardDescription>
          점수 기반 로테이션과 목표 비중 점검을 구분해서 봅니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm leading-6 text-muted-foreground md:grid-cols-3">
        <div>
          <h3 className="font-medium text-foreground">전략형</h3>
          <p>
            매월 또는 정해진 주기에 ETF 점수를 다시 계산하고, 전략별 역할과
            비중에 맞는 후보를 고릅니다.
          </p>
        </div>
        <div>
          <h3 className="font-medium text-foreground">비중 조정형</h3>
          <p>
            분기 1회 점검을 기본으로 두고 목표 비중에서 ±5%p 이상 벗어나면
            조정을 검토합니다.
          </p>
        </div>
        <div>
          <h3 className="font-medium text-foreground">주의</h3>
          <p>
            TLT는 현금이 아니라 장기금리 변화에 민감한 장기채 노출이고, GLD는
            현금흐름 없는 금 가격 노출입니다.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
