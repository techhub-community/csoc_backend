from django.urls import path

from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)


from .views import (
    UserRegistrationAPIView,
    ListUsersAPIView 
)

app_name = 'users'


urlpatterns = [
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/register/', UserRegistrationAPIView.as_view(), name='user-registration'),
    path('api/users/', ListUsersAPIView.as_view(), name='list-users'),
    # path('', DashboardView.as_view(), name='dashboard'),
    # path('login/', UserLoginView.as_view(), name='login'),
    # path('register/', UserRegistrationView.as_view(), name='register'), 
]
