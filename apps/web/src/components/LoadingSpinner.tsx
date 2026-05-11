export default function LoadingSpinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex justify-center items-center ${className}`}>
      <div className="w-8 h-8 border-2 border-pit-teal border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
