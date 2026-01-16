import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { trpc } from "@/lib/trpc";
import { Calendar, TrendingUp, Users } from "lucide-react";

type ChartView = "revenue" | "users";
type PeriodFilter = "today" | "week" | "month" | "custom";

export function AnalyticsChart() {
  const [chartView, setChartView] = useState<ChartView>("revenue");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("week");
  
  // Calculate date ranges based on filter
  const getDateRange = () => {
    const end = new Date();
    const start = new Date();
    
    switch (periodFilter) {
      case "today":
        start.setHours(0, 0, 0, 0);
        break;
      case "week":
        start.setDate(start.getDate() - 7);
        break;
      case "month":
        start.setDate(start.getDate() - 30);
        break;
      default:
        start.setDate(start.getDate() - 7);
    }
    
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  };
  
  const dateRange = getDateRange();
  
  const { data: revenueData, isLoading: revenueLoading } = trpc.admin.dashboard.revenueTimeSeries.useQuery(
    dateRange,
    { enabled: chartView === "revenue" }
  );
  
  const { data: userData, isLoading: userLoading } = trpc.admin.dashboard.userGrowthTimeSeries.useQuery(
    dateRange,
    { enabled: chartView === "users" }
  );
  
  const isLoading = chartView === "revenue" ? revenueLoading : userLoading;
  const chartData = chartView === "revenue" ? revenueData : userData;
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Analytics Overview</CardTitle>
            <CardDescription>
              {chartView === "revenue" ? "Total revenue over time" : "User growth over time"}
            </CardDescription>
          </div>
          
          {/* Chart View Toggle */}
          <div className="flex gap-2">
            <Button
              variant={chartView === "revenue" ? "default" : "outline"}
              size="sm"
              onClick={() => setChartView("revenue")}
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Revenue
            </Button>
            <Button
              variant={chartView === "users" ? "default" : "outline"}
              size="sm"
              onClick={() => setChartView("users")}
            >
              <Users className="h-4 w-4 mr-2" />
              Users
            </Button>
          </div>
        </div>
        
        {/* Period Filters */}
        <div className="flex gap-2 mt-4">
          <Button
            variant={periodFilter === "today" ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriodFilter("today")}
          >
            Today
          </Button>
          <Button
            variant={periodFilter === "week" ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriodFilter("week")}
          >
            This Week
          </Button>
          <Button
            variant={periodFilter === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriodFilter("month")}
          >
            This Month
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-[400px]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : !chartData || chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
            <Calendar className="h-12 w-12 mb-4 opacity-50" />
            <p>No data available for this period</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                className="text-xs"
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis className="text-xs" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
                labelFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleDateString();
                }}
                formatter={(value: number) => {
                  if (chartView === "revenue") {
                    return [`€${value.toFixed(2)}`, "Revenue"];
                  }
                  return [value, "Users"];
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey={chartView === "revenue" ? "revenue" : "users"}
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))' }}
                name={chartView === "revenue" ? "Revenue (€)" : "Total Users"}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
