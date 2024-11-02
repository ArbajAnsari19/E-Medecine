import  { useState, useEffect } from 'react';
import { Search } from 'lucide-react';

interface Medicine {
  name: string;
  generic_name: string;
  manufacturer: string;
  category: string;
  price: number;
  dosage: string;
  description: string;
}

interface SearchFilters {
  categories: string[];
  manufacturers: string[];
}

const defaultFilters: SearchFilters = {
  categories: [],
  manufacturers: []
};

export default function MedicineSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedManufacturer, setSelectedManufacturer] = useState('');
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [filters, setFilters] = useState<SearchFilters>(defaultFilters);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_URL = 'http://localhost:3001';

  // Fetch available filters
  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const response =  await fetch(`${API_URL}/api/filters`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setFilters({
          categories: data.categories || [],
          manufacturers: data.manufacturers || []
        });
      } catch (error) {
        console.error('Error fetching filters:', error);
        setError('Failed to load filters. Please try again later.');
        setFilters(defaultFilters);
      }
    };

    fetchFilters();
  }, []);

  // Search function
  const searchMedicines = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        ...(searchQuery && { q: searchQuery }),
        ...(selectedCategory && { category: selectedCategory }),
        ...(selectedManufacturer && { manufacturer: selectedManufacturer })
      });

      const response = await fetch(`${API_URL}/api/search?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setMedicines(data.hits || []);
    } catch (error) {
      console.error('Error searching medicines:', error);
      setError('Failed to search medicines. Please try again later.');
      setMedicines([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    searchMedicines();
  }, [searchQuery, selectedCategory, selectedManufacturer]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
            <p className="text-red-700">{error}</p>
          </div>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Medicine Search</h1>
          
          {/* Search and Filters */}
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-3 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Search medicines..."
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              <select
                className="border rounded-lg px-4 py-2"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="">All Categories</option>
                {filters.categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              
              <select
                className="border rounded-lg px-4 py-2"
                value={selectedManufacturer}
                onChange={(e) => setSelectedManufacturer(e.target.value)}
              >
                <option value="">All Manufacturers</option>
                {filters.manufacturers.map(manufacturer => (
                  <option key={manufacturer} value={manufacturer}>{manufacturer}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Results */}
          <div className="mt-8">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {medicines.map((medicine, index) => (
                  <div key={index} className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
                    <h3 className="text-lg font-semibold text-gray-900">{medicine.name}</h3>
                    <p className="text-sm text-gray-600">{medicine.generic_name}</p>
                    <div className="mt-2">
                      <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                        {medicine.category}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-700">{medicine.description}</p>
                    <div className="mt-4 flex justify-between items-center">
                      <span className="text-lg font-bold text-green-600">${medicine.price}</span>
                      <span className="text-sm text-gray-500">{medicine.dosage}</span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">{medicine.manufacturer}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}