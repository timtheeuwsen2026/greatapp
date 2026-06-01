import Navigation from "@/components/navigation";
import EmbeddedPricingCalculator from "@/components/embedded-pricing-calculator";

export default function CreatorEarnings() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-blue-900 dark:to-purple-900">
      <Navigation />
      
      <div className="pt-20 pb-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header Section */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
              Creator Earnings Model
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              Transparent pricing based on your role and support needs. See exactly how much you'll earn from your experiences with our flexible revenue sharing models.
            </p>
          </div>

          {/* Pricing Calculator Section */}
          <div className="mb-16">
            <div className="text-center mb-8">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-4">
                Calculate Your Earning Potential
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-300">
                Enter your experience price to see the breakdown of fees and your net earnings
              </p>
            </div>
            <EmbeddedPricingCalculator />
          </div>
        </div>
      </div>
    </div>
  );
}