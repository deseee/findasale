import React from 'react';

interface WeatherAlertCardProps {
  city?: string;
}

const WeatherAlertCard: React.FC<WeatherAlertCardProps> = ({ city = 'Grand Rapids' }) => {
  // Mock weather data for MVP — can integrate with OpenWeather API later
  const mockWeather = {
    condition: 'Partly Cloudy',
    temp: 62,
    humidity: 65,
    windSpeed: 8,
    forecast: 'Good day for outdoor sales',
    icon: '⛅',
  };

  return (
    <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 rounded-lg shadow-md dark:shadow-gray-900/50 p-6 border border-blue-200 dark:border-blue-700/50">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-200 mb-1">Weather in {city}</h3>
          <p className="text-sm text-blue-700 dark:text-blue-300">Updated just now</p>
        </div>
        <div className="text-5xl">{mockWeather.icon}</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div>
          <p className="text-xs text-blue-700 dark:text-blue-400 font-semibold uppercase mb-1">Condition</p>
          <p className="text-lg font-bold text-blue-900 dark:text-blue-100">{mockWeather.condition}</p>
        </div>
        <div>
          <p className="text-xs text-blue-700 dark:text-blue-400 font-semibold uppercase mb-1">Temp</p>
          <p className="text-lg font-bold text-blue-900 dark:text-blue-100">{mockWeather.temp}°F</p>
        </div>
        <div>
          <p className="text-xs text-blue-700 dark:text-blue-400 font-semibold uppercase mb-1">Humidity</p>
          <p className="text-lg font-bold text-blue-900 dark:text-blue-100">{mockWeather.humidity}%</p>
        </div>
        <div>
          <p className="text-xs text-blue-700 dark:text-blue-400 font-semibold uppercase mb-1">Wind</p>
          <p className="text-lg font-bold text-blue-900 dark:text-blue-100">{mockWeather.windSpeed} mph</p>
        </div>
      </div>

      <div className="bg-white/50 dark:bg-gray-800/50 p-3 rounded-md">
        <p className="text-sm text-blue-900 dark:text-blue-100">
          <span className="font-semibold">✓</span> {mockWeather.forecast}
        </p>
      </div>

      <p className="text-xs text-blue-600 dark:text-blue-400 mt-4 text-center">
        💡 Pro tip: Check weather forecasts before scheduling sales
      </p>
    </div>
  );
};

export default WeatherAlertCard;
