import * as React from 'react';
import { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import Papa from 'papaparse';

interface ImportCustomersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ImportCustomersDialog({ open, onOpenChange, onSuccess }: ImportCustomersDialogProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const response = await fetch('/api/admin/customers/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customers: results.data }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Import failed');
          }

          if (data.errors?.length > 0) {
            console.warn('Import completed with some errors:', data.errors);
            alert(`Imported ${data.importedCount} customers. ${data.errors.length} failed. Check console for details.`);
          } else {
            alert(`Successfully imported ${data.importedCount} customers.`);
          }

          onSuccess();
          onOpenChange(false);
        } catch (err: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) {
          setError(err.message || 'An error occurred during import.');
        } finally {
          setIsImporting(false);
          // reset input
          e.target.value = '';
        }
      },
      error: (err) => {
        setError(`Failed to parse CSV: ${err.message}`);
        setIsImporting(false);
      }
    });
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] rounded-xl bg-white p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <DialogPrimitive.Title className="text-xl font-bold">Import Customers</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button className="rounded-full p-1.5 hover:bg-slate-100">
                <X className="h-5 w-5" />
                <span className="sr-only">Close</span>
              </button>
            </DialogPrimitive.Close>
          </div>
          
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Upload a CSV file containing your customers. Required columns are:
              <br />
              <code className="font-mono bg-slate-100 px-1 rounded">first_name</code>, <code className="font-mono bg-slate-100 px-1 rounded">last_name</code>, and <code className="font-mono bg-slate-100 px-1 rounded">email</code>.
            </p>

            <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-8 hover:bg-slate-50 transition-colors">
              <label htmlFor="csv-upload" className="cursor-pointer text-center">
                <div className="text-sm font-medium text-slate-900 bg-white border border-slate-300 rounded-md px-4 py-2 hover:bg-slate-50">
                  {isImporting ? 'Importing...' : 'Select CSV File'}
                </div>
                <input 
                  id="csv-upload" 
                  type="file" 
                  accept=".csv" 
                  className="hidden" 
                  onChange={handleFileUpload}
                  disabled={isImporting}
                />
              </label>
            </div>

            {error && (
              <div className="p-3 rounded-md bg-red-50 text-red-600 text-sm">
                {error}
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}