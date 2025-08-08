import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Clock } from "lucide-react";

export function PaymentScheduler() {
  const [paymentData, setPaymentData] = useState({
    loanId: "",
    amount: "",
    payeeName: "",
    payeeAddress: "",
    dueDate: "",
    notes: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement payment scheduling logic
    console.log("Scheduling payment:", paymentData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Clock className="w-5 h-5" />
          <span>Schedule New Payment</span>
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="loanId">Loan ID</Label>
              <Input
                id="loanId"
                placeholder="Enter loan number"
                value={paymentData.loanId}
                onChange={(e) => setPaymentData({ ...paymentData, loanId: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Payment Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={paymentData.amount}
                onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payeeName">Payee Name</Label>
              <Input
                id="payeeName"
                placeholder="Enter payee name"
                value={paymentData.payeeName}
                onChange={(e) => setPaymentData({ ...paymentData, payeeName: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={paymentData.dueDate}
                onChange={(e) => setPaymentData({ ...paymentData, dueDate: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="payeeAddress">Payee Address</Label>
              <Input
                id="payeeAddress"
                placeholder="Enter payee address"
                value={paymentData.payeeAddress}
                onChange={(e) => setPaymentData({ ...paymentData, payeeAddress: e.target.value })}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes or instructions"
                value={paymentData.notes}
                onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3">
            <Button type="button" variant="outline">
              Cancel
            </Button>
            <Button type="submit">
              <Calendar className="w-4 h-4 mr-2" />
              Schedule Payment
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
