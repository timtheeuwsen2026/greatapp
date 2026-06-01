import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface DepositMutationParams {
  experienceId: string;
  amount: number;
  paymentMethodNonce?: string;
}

interface MVGStatus {
  funded_amount: number;
  funded_amount_confirmed: number;
  funded_amount_pending: number;
  funded_percent: number;
  remaining_to_mvg: number;
  seats_taken: number;
  seats_confirmed: number;
  seats_pending: number;
  seats_total: number;
}

interface DepositResponse {
  success: boolean;
  message: string;
  booking: {
    id: string;
    experienceId: string;
    userId: string;
    amount: string;
    status: string;
    depositStatus: string;
  };
  mvg_status: MVGStatus;
}

export function useDepositMutation() {
  return useMutation({
    mutationFn: async ({ experienceId, amount, paymentMethodNonce = "sandbox_test" }: DepositMutationParams) => {
      const paymentRes = await apiRequest("POST", "/api/payments/create-intent", {
        experienceId,
        amount,
        paymentMethodNonce,
      });

      const paymentResponse = await paymentRes.json() as {
        success: boolean;
        paymentIntentId: string;
        clientSecret: string | null;
        sandboxMode: boolean;
      };

      if (!paymentResponse.success) {
        throw new Error("Failed to create payment intent");
      }

      const depositRes = await apiRequest("POST", `/api/trips/${experienceId}/deposit`, {
        amount,
        payment_method_nonce: paymentResponse.paymentIntentId,
      });
      
      const response = await depositRes.json() as DepositResponse;
      return response;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/experiences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/experiences", variables.experienceId] });
    },
  });
}
