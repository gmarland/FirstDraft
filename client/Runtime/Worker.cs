using Microsoft.Extensions.Hosting;
using FirstDraft.Api;
using FirstDraft.Commands;
using FirstDraft.Configuration;
using FirstDraft.Infrastructure.Logging;

namespace FirstDraft.Runtime
{
    public class Worker : BackgroundService
    {
        private readonly ApplicationDataService _applicationDataService;
        private readonly CommandDispatcher _commandDispatcher;

        private Log? _logger;
        private ApplicationData? _applicationData;
        private ApplicationAPI? _applicationAPI;

        public Worker(ApplicationDataService applicationDataService, CommandDispatcher commandDispatcher)
        {
            _applicationDataService = applicationDataService;
            _commandDispatcher = commandDispatcher;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            if (_applicationData == null) _applicationData = await _applicationDataService.GetApplicationData();

            if (_logger == null) _logger = new Log(_applicationData.GetLogsFolder(), 7);

            _logger.Info("firstdraft client: v0.1");

            while (!stoppingToken.IsCancellationRequested)
            {
                if (_applicationAPI == null)
                {
                    try
                    {
                        _applicationAPI = new ApplicationAPI(_logger, _applicationData, _applicationDataService, _commandDispatcher);
                        await _applicationAPI.Connect();
                    }
                    catch (Exception ex)
                    {
                        _logger.Error("Error connecting to website API", ex);
                    }
                }

                await Task.Delay(1000, stoppingToken);
            }

            if (_applicationAPI != null)
            {
                _logger.Info("Stopping connection");

                await _applicationAPI.Stop();
                _applicationAPI = null;
            }
        }
    }
}
