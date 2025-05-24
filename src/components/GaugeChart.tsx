import React, { useEffect, useState } from 'react';
import GaugeChart from 'react-gauge-chart';

interface SensorGaugeProps {
  value: number;
  minValue?: number;
  maxValue?: number;
  title: string;
  unit: string;
  colorStart?: string;
  colorEnd?: string;
  showPercent?: boolean;
  lastUpdate?: Date;
  refreshInterval?: number;
  showStatus?: boolean;
}

const SensorGauge: React.FC<SensorGaugeProps> = ({
  value,
  minValue = 0,
  maxValue = 100,
  title,
  unit,
  colorStart = '#5BE12C',
  colorEnd = '#F5CD19',
  showPercent = false,
  lastUpdate,
  refreshInterval = 5,
  showStatus = false
}) => {
  const [isOnline, setIsOnline] = useState(true);
  const [isBlinking, setIsBlinking] = useState(false);
  const [animatedValue, setAnimatedValue] = useState(value);
  const [status, setStatus] = useState<'normal' | 'critical'>('normal');

  // Check if sensor is online based on last update time
  useEffect(() => {
    const checkOnlineStatus = () => {
      if (!lastUpdate) {
        setIsOnline(false);
        return;
      }

      const now = new Date();
      const diffInSeconds = (now.getTime() - new Date(lastUpdate).getTime()) / 1000;
      setIsOnline(diffInSeconds <= 60);
    };

    checkOnlineStatus();
    const interval = setInterval(checkOnlineStatus, 1000);
    return () => clearInterval(interval);
  }, [lastUpdate]);

  // Blinking animation for online status
  useEffect(() => {
    if (isOnline) {
      const interval = setInterval(() => {
        setIsBlinking(prev => !prev);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isOnline]);

  // Smooth gauge animation
  useEffect(() => {
    const duration = refreshInterval * 1000;
    const steps = 60;
    const stepDuration = duration / steps;
    const valueChange = value - animatedValue;
    const stepValue = valueChange / steps;
    let currentStep = 0;

    const interval = setInterval(() => {
      if (currentStep < steps) {
        setAnimatedValue(prev => {
          const next = prev + stepValue;
          return Number(next.toFixed(1));
        });
        currentStep++;
      }
    }, stepDuration);

    return () => clearInterval(interval);
  }, [value, refreshInterval]);

  // Update status based on value
  useEffect(() => {
    const normalizedValue = (value - minValue) / (maxValue - minValue);
    setStatus(normalizedValue > 0.8 || normalizedValue < 0.2 ? 'critical' : 'normal');
  }, [value, minValue, maxValue]);

  // Normalize the value between 0 and 1 for the gauge
  const normalizedValue = (animatedValue - minValue) / (maxValue - minValue);
  const safeValue = Math.max(0, Math.min(1, normalizedValue));

  return (
    <div className={`bg-gray-800 rounded-lg p-4 flex flex-col items-center relative ${!isOnline ? 'opacity-50' : ''}`}>
      <div className="absolute top-4 right-4 flex items-center">
        <div className={`h-3 w-3 rounded-full ${
          isOnline 
            ? `bg-green-500 ${isBlinking ? 'opacity-100' : 'opacity-50'}`
            : 'bg-red-500'
        } transition-opacity duration-500`}></div>
        <span className="ml-2 text-xs text-gray-400">
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>

      <h3 className="text-gray-300 text-sm font-medium mb-2">{title}</h3>
      
      <GaugeChart
        id={`gauge-${title.toLowerCase().replace(/\s+/g, '-')}`}
        nrOfLevels={20}
        colors={[colorStart, colorEnd]}
        arcWidth={0.3}
        percent={safeValue}
        textColor="#ffffff"
        formatTextValue={() => showPercent ? `${(safeValue * 100).toFixed(1)}%` : `${animatedValue.toFixed(1)} ${unit}`}
      />

      {showStatus && (
        <div className={`mt-2 px-3 py-1 rounded-full text-sm ${
          status === 'critical' 
            ? 'bg-red-500/20 text-red-400 animate-pulse'
            : 'bg-green-500/20 text-green-400'
        }`}>
          {status === 'critical' ? 'Critical' : 'Normal'}
        </div>
      )}
    </div>
  );
};

export default SensorGauge;