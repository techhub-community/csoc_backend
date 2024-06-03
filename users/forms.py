from django import forms
from django.contrib.auth.forms import (AuthenticationForm, UserChangeForm,
                                       UserCreationForm)

from .models import CustomUser


class CustomUserCreationForm(UserCreationForm):
    class Meta(UserCreationForm.Meta):
        model = CustomUser
        fields = ('email', 'role')
        widgets = {
            'password1': forms.PasswordInput(),
            'password2': forms.PasswordInput(),
        }


class CustomUserChangeForm(UserChangeForm):
    class Meta:
        model = CustomUser
        fields = ('email', 'role', 'password')
        widgets = {
            'password': forms.PasswordInput(render_value=True),
        }


class UserRegistrationForm(forms.ModelForm):
    password = forms.CharField(label="Password", widget=forms.PasswordInput)
    password2 = forms.CharField(label="Repeat password", widget=forms.PasswordInput)
    class Meta:
        model = CustomUser
        fields = ['email', 'role']
    
    def clean_password2(self):
        cd = self.cleaned_data
        if cd["password"] != cd["password2"]:
            raise forms.ValidationError("Passwords don't match.")
        return cd["password2"]

    def clean_email(self):
        data = self.cleaned_data["email"]
        if CustomUser.objects.filter(email=data).exists():
            raise forms.ValidationError("Email already in use.")
        return data

class LoginForm(AuthenticationForm):
    class Meta:
        model = CustomUser
        fields = ['email', 'password']